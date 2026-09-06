import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScheduleEntry, ScheduleEntryDocument } from './schemas/schedule-entry.schema';
import { ScheduleBoard, ScheduleBoardDocument } from './schemas/schedule-board.schema';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { UpsertScheduleBoardDto } from './dto/upsert-schedule-board.dto';
import { UsersService } from '../users/users.service';
import { PostsService } from '../posts/posts.service';
import { PostAttachmentType, PostScope } from '../posts/schemas/post.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Department } from '../common/enums/department.enum';
import { AcademicYear } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';

export interface ScheduleStats {
  totalEntries: number;
  groupsCovered: number;
  avgEntriesPerGroup: number;
}

interface Group {
  department: Department;
  academicYear: AcademicYear;
  specialization: Specialization;
}

// index = ScheduleEntry.dayOfWeek (0 = Sunday .. 6 = Saturday), for the auto-posted caption below.
const WEEKDAY_LABELS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectModel(ScheduleEntry.name) private scheduleModel: Model<ScheduleEntryDocument>,
    @InjectModel(ScheduleBoard.name) private scheduleBoardModel: Model<ScheduleBoardDocument>,
    private readonly usersService: UsersService,
    // forwardRef: PostsModule -> AiModule -> ScheduleModule already existed, so ScheduleModule
    // importing PostsModule (to auto-post new entries to the feed, below) closes a cycle -- see
    // the matching forwardRef pair on AiModule/AssignmentsModule for the same reason.
    @Inject(forwardRef(() => PostsService)) private readonly postsService: PostsService,
  ) {}

  // --- Writes (admin/professor, guarded at the controller level) ---

  async create(user: AuthenticatedUser, dto: CreateScheduleEntryDto): Promise<ScheduleEntryDocument> {
    this.assertValidRange(dto.startTime, dto.endTime);
    const group = { department: dto.department, academicYear: dto.academicYear, specialization: dto.specialization };
    await this.assertNoOverlap(group, dto.dayOfWeek, dto.startTime, dto.endTime);

    const entry = new this.scheduleModel({
      createdBy: new Types.ObjectId(user.userId),
      department: dto.department,
      academicYear: dto.academicYear,
      specialization: dto.specialization,
      dayOfWeek: dto.dayOfWeek,
      courseName: dto.courseName,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location ?? null,
      description: dto.description ?? null,
      photoUrl: dto.photoUrl ?? null,
    });
    await entry.save();

    // Best-effort: a new entry also shows up as a normal feed post (tagged with the same
    // department, same rule PostsService already applies to every other department-tagged post --
    // students AND professors in that شعبة both see it, no role branching needed). Never let a
    // feed-post hiccup fail the schedule write itself, which is the part the caller actually asked
    // for and already committed above.
    this.postFeedAnnouncement(entry, user).catch((err) =>
      this.logger.warn(`Failed to auto-post schedule entry ${entry._id} to feed: ${err instanceof Error ? err.message : err}`),
    );

    return entry;
  }

  private async postFeedAnnouncement(entry: ScheduleEntryDocument, user: AuthenticatedUser): Promise<void> {
    const dayLabel = WEEKDAY_LABELS_AR[entry.dayOfWeek];
    let caption = `📅 تمت إضافة حصة جديدة إلى الجدول الدراسي\n${entry.courseName} — ${dayLabel} من ${entry.startTime} إلى ${entry.endTime}`;
    if (entry.location) caption += `\n📍 ${entry.location}`;
    if (entry.description) caption += `\n\n${entry.description}`;

    await this.postsService.create(user.userId, user.role, user.department, {
      caption,
      attachmentType: entry.photoUrl ? PostAttachmentType.IMAGE : PostAttachmentType.NONE,
      images: entry.photoUrl ? [entry.photoUrl] : undefined,
      scope: PostScope.PUBLIC,
      department: entry.department,
      academicYear: entry.academicYear,
      specialization: entry.specialization,
    });
  }

  // --- Schedule board photo: "upload the whole timetable as one photo" instead of building it
  // lecture-by-lecture via create() above. One photo per group -- uploading again replaces it. ---

  async upsertBoard(user: AuthenticatedUser, dto: UpsertScheduleBoardDto): Promise<ScheduleBoardDocument> {
    const group = { department: dto.department, academicYear: dto.academicYear, specialization: dto.specialization };
    const board = await this.scheduleBoardModel.findOneAndUpdate(
      group,
      {
        ...group,
        updatedBy: new Types.ObjectId(user.userId),
        photoUrl: dto.photoUrl,
        description: dto.description ?? null,
      },
      { upsert: true, new: true },
    );

    // Best-effort, same reasoning as postFeedAnnouncement below -- never fail the upload itself.
    this.postBoardFeedAnnouncement(board, user).catch((err) =>
      this.logger.warn(`Failed to auto-post schedule board ${board._id} to feed: ${err instanceof Error ? err.message : err}`),
    );

    return board;
  }

  private async postBoardFeedAnnouncement(board: ScheduleBoardDocument, user: AuthenticatedUser): Promise<void> {
    let caption = '📅 تم نشر الجدول الدراسي';
    if (board.description) caption += `\n\n${board.description}`;

    await this.postsService.create(user.userId, user.role, user.department, {
      caption,
      attachmentType: PostAttachmentType.IMAGE,
      images: [board.photoUrl],
      scope: PostScope.PUBLIC,
      department: board.department,
      academicYear: board.academicYear,
      specialization: board.specialization,
    });
  }

  async getBoardForGroup(group: Group): Promise<ScheduleBoardDocument | null> {
    return this.scheduleBoardModel.findOne(group).exec();
  }

  // Mirrors findForUser() -- resolves the caller's own group from their profile.
  async getBoardForUser(userId: string): Promise<ScheduleBoardDocument | null> {
    const user = await this.usersService.findById(userId);
    if (!user.department || !user.academicYear || !user.specialization) return null;
    return this.getBoardForGroup({
      department: user.department,
      academicYear: user.academicYear,
      specialization: user.specialization,
    });
  }

  async removeBoard(group: Group): Promise<void> {
    await this.scheduleBoardModel.deleteOne(group).exec();
  }

  async update(id: string, dto: UpdateScheduleEntryDto): Promise<ScheduleEntryDocument> {
    const entry = await this.findById(id);

    const department = dto.department ?? entry.department;
    const academicYear = dto.academicYear ?? entry.academicYear;
    const specialization = dto.specialization ?? entry.specialization;
    const dayOfWeek = dto.dayOfWeek ?? entry.dayOfWeek;
    const startTime = dto.startTime ?? entry.startTime;
    const endTime = dto.endTime ?? entry.endTime;

    this.assertValidRange(startTime, endTime);
    await this.assertNoOverlap({ department, academicYear, specialization }, dayOfWeek, startTime, endTime, id);

    entry.department = department;
    entry.academicYear = academicYear;
    entry.specialization = specialization;
    entry.dayOfWeek = dayOfWeek;
    entry.courseName = dto.courseName ?? entry.courseName;
    entry.startTime = startTime;
    entry.endTime = endTime;
    if (dto.location !== undefined) entry.location = dto.location;
    if (dto.description !== undefined) entry.description = dto.description;
    if (dto.photoUrl !== undefined) entry.photoUrl = dto.photoUrl;

    return entry.save();
  }

  async remove(id: string): Promise<void> {
    const entry = await this.findById(id);
    await this.scheduleModel.findByIdAndDelete(entry._id).exec();
  }

  private async findById(id: string): Promise<ScheduleEntryDocument> {
    const entry = await this.scheduleModel.findById(id).exec();
    if (!entry) throw new NotFoundException('الحصة غير موجودة');
    return entry;
  }

  // --- Reads (open to any authenticated user -- the timetable itself isn't sensitive, same as
  // the public lecture library) ---

  async findForGroup(group: Group): Promise<ScheduleEntryDocument[]> {
    return this.scheduleModel
      .find(group)
      .sort({ dayOfWeek: 1, startTime: 1 })
      .exec();
  }

  // The signed-in user's own class schedule, resolved from their profile. Empty until an admin
  // has set the user's department/academicYear/specialization (see User schema) and published a
  // matching schedule.
  async findForUser(userId: string): Promise<ScheduleEntryDocument[]> {
    const user = await this.usersService.findById(userId);
    if (!user.department || !user.academicYear || !user.specialization) return [];
    return this.findForGroup({
      department: user.department,
      academicYear: user.academicYear,
      specialization: user.specialization,
    });
  }

  private assertValidRange(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    }
  }

  private async assertNoOverlap(group: Group, dayOfWeek: number, startTime: string, endTime: string, excludeId?: string) {
    const filter: Record<string, unknown> = {
      ...group,
      dayOfWeek,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };

    const conflict = await this.scheduleModel.exists(filter);
    if (conflict) {
      throw new BadRequestException('يوجد تعارض في الجدول مع محاضرة أخرى في نفس الوقت لنفس الفئة');
    }
  }

  // --- Admin stats ---

  async getStats(): Promise<ScheduleStats> {
    const [totalEntries, distinctGroups] = await Promise.all([
      this.scheduleModel.countDocuments().exec(),
      this.scheduleModel
        .aggregate<{ _id: Group }>([
          { $group: { _id: { department: '$department', academicYear: '$academicYear', specialization: '$specialization' } } },
        ])
        .exec(),
    ]);
    const groupsCovered = distinctGroups.length;
    return {
      totalEntries,
      groupsCovered,
      avgEntriesPerGroup: groupsCovered ? Math.round((totalEntries / groupsCovered) * 10) / 10 : 0,
    };
  }
}
