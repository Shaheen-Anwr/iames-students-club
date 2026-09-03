import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateGroupAssignmentDto } from './dto/create-group-assignment.dto';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { LectureIndexService } from '../ai/lecture-index.service';
import { Role } from '../common/enums/role.enum';
import { GroupsService } from '../groups/groups.service';

export interface AssignmentStats {
  totalAssignments: number;
  totalCompletions: number;
  avgCompletionsPerAssignment: number;
  overdue: number;
}

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    private readonly gamificationService: GamificationService,
    private readonly lectureIndexService: LectureIndexService,
    private readonly groupsService: GroupsService,
  ) {}

  // Assignments a student creates are personal (visible only to them); professor-created ones
  // stay global, matching the pre-existing behavior. Group-scoped assignments are excluded
  // unconditionally -- they're only reachable through findAllForGroup()/findDueInRange() callers
  // that explicitly want them, gated by group membership, never through the global list/calendar.
  private visibilityFilter(requesterId?: string): Record<string, unknown> {
    if (!requesterId) return { isPersonal: { $ne: true }, group: null };
    return {
      group: null,
      $or: [{ isPersonal: { $ne: true } }, { createdBy: new Types.ObjectId(requesterId) }],
    };
  }

  async create(creatorId: string, creatorRole: Role, dto: CreateAssignmentDto): Promise<AssignmentDocument> {
    // التربية العسكرية assignments are always global (visible to every student) and carry a
    // fixed course label when none is given -- see the isMilitary prop on the schema.
    const isMilitary = !!dto.isMilitary;
    const assignment = new this.assignmentModel({
      createdBy: new Types.ObjectId(creatorId),
      title: dto.title,
      description: dto.description ?? '',
      courseCode: dto.courseCode?.trim() || (isMilitary ? 'التربية العسكرية' : dto.courseCode),
      dueDate: new Date(dto.dueDate),
      attachmentType: dto.attachmentType ?? 'none',
      attachmentUrl: dto.attachmentUrl ?? null,
      attachmentOriginalName: dto.attachmentOriginalName ?? null,
      isPersonal: !isMilitary && creatorRole === Role.STUDENT,
      isMilitary,
    });
    await assignment.save();

    // Fire-and-forget, same as PostsService.create -- assignments aren't department-scoped
    // themselves, so their lecture chunks are indexed as platform-wide (department: null).
    void this.lectureIndexService.indexIfLecture({
      sourceType: 'assignment',
      sourceId: assignment.id,
      attachmentType: assignment.attachmentType,
      attachmentUrl: assignment.attachmentUrl,
      attachmentOriginalName: assignment.attachmentOriginalName,
      courseCode: assignment.courseCode,
      department: null,
    });

    return assignment;
  }

  async findAll(
    page = 1,
    limit = 20,
    courseCode?: string,
    upcoming?: boolean,
    requesterId?: string,
    military?: boolean,
  ): Promise<AssignmentDocument[]> {
    const filter: Record<string, unknown> = this.visibilityFilter(requesterId);
    if (courseCode) filter.courseCode = courseCode;
    if (upcoming) filter.dueDate = { $gte: new Date() };
    // The military section asks for its own assignments; every other caller gets the normal
    // list with military ones excluded so they don't leak into the general الواجبات board.
    filter.isMilitary = military ? true : { $ne: true };
    return this.assignmentModel
      .find(filter)
      .sort({ dueDate: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name role photoUrl')
      .exec();
  }

  // Used by CalendarService to pull the month's due dates -- global assignments are shared by
  // everyone, personal ones only show up on their creator's own calendar.
  async findDueInRange(start: Date, end: Date, requesterId?: string): Promise<AssignmentDocument[]> {
    return this.assignmentModel
      .find({ ...this.visibilityFilter(requesterId), dueDate: { $gte: start, $lt: end } })
      .sort({ dueDate: 1 })
      .populate('createdBy', 'name role photoUrl')
      .exec();
  }

  async findOne(id: string, requesterId?: string): Promise<AssignmentDocument> {
    const assignment = await this.assignmentModel.findById(id).populate('createdBy', 'name role photoUrl').exec();
    // Personal assignments 404 for everyone but their creator, same as if they didn't exist.
    if (!assignment || (assignment.isPersonal && assignment.createdBy._id.toString() !== requesterId)) {
      throw new NotFoundException('الواجب غير موجود');
    }
    // Group-scoped assignments are gated on membership -- toggleComplete()/remove() both call
    // findOne() internally, so this single check protects those paths too.
    if (assignment.group) {
      await this.groupsService.assertMember(assignment.group.toString(), requesterId ?? '');
    }
    return assignment;
  }

  async createForGroup(groupId: string, creatorId: string, dto: CreateGroupAssignmentDto): Promise<AssignmentDocument> {
    await this.groupsService.assertOwner(groupId, creatorId);
    const assignment = new this.assignmentModel({
      createdBy: new Types.ObjectId(creatorId),
      title: dto.title,
      description: dto.description ?? '',
      courseCode: dto.courseCode ?? '',
      dueDate: new Date(dto.dueDate),
      attachmentType: dto.attachmentType ?? 'none',
      attachmentUrl: dto.attachmentUrl ?? null,
      attachmentOriginalName: dto.attachmentOriginalName ?? null,
      isPersonal: false,
      group: new Types.ObjectId(groupId),
    });
    await assignment.save();
    // Deliberately skip lectureIndexService.indexIfLecture() here -- unlike global assignments,
    // a group's attachment content shouldn't become AI-searchable platform-wide (department: null
    // would otherwise expose a private group's material to every user via the AI assistant).
    return assignment;
  }

  async findAllForGroup(groupId: string, requesterId: string, page = 1, limit = 20): Promise<AssignmentDocument[]> {
    await this.groupsService.assertMember(groupId, requesterId);
    return this.assignmentModel
      .find({ group: new Types.ObjectId(groupId) })
      .sort({ dueDate: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name role photoUrl')
      .exec();
  }

  async toggleComplete(id: string, userId: string): Promise<AssignmentDocument> {
    const assignment = await this.findOne(id, userId);
    const uid = new Types.ObjectId(userId);
    const alreadyCompleted = assignment.completedBy.some((cid) => cid.equals(uid));

    if (alreadyCompleted) {
      assignment.completedBy = assignment.completedBy.filter((cid) => !cid.equals(uid));
    } else {
      assignment.completedBy.push(uid);
    }
    await assignment.save();

    if (!alreadyCompleted) {
      await this.gamificationService.awardPoints(userId, POINTS.ASSIGNMENT_COMPLETED, 'assignment_completed');
      const completedCount = await this.assignmentModel.countDocuments({ completedBy: uid }).exec();
      if (completedCount >= 5) await this.gamificationService.maybeAwardBadge(userId, 'assignments_5');
    }
    return assignment;
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const assignment = await this.findOne(id, requesterId);
    if (!assignment.createdBy || assignment.createdBy._id.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك حذف الواجبات التي أنشأتها فقط');
    }
    await this.assignmentModel.findByIdAndDelete(id).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async adminListAssignments(page = 1, limit = 20, search?: string) {
    const filter = search
      ? { $or: [{ title: { $regex: search, $options: 'i' } }, { courseCode: { $regex: search, $options: 'i' } }] }
      : {};
    const [data, total] = await Promise.all([
      this.assignmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('createdBy', 'name role photoUrl')
        .exec(),
      this.assignmentModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  // Same as remove() but skips the creator-only restriction (see remove()'s comment) -- an
  // admin can delete any assignment.
  async adminRemove(id: string): Promise<void> {
    const assignment = await this.assignmentModel.findByIdAndDelete(id).exec();
    if (!assignment) throw new NotFoundException('الواجب غير موجود');
  }

  async getStats(): Promise<AssignmentStats> {
    const [totalAssignments, overdue, completionAgg] = await Promise.all([
      this.assignmentModel.countDocuments().exec(),
      this.assignmentModel.countDocuments({ dueDate: { $lt: new Date() } }).exec(),
      this.assignmentModel
        .aggregate<{ totalCompletions: number; avgCompletions: number }>([
          { $project: { count: { $size: '$completedBy' } } },
          { $group: { _id: null, totalCompletions: { $sum: '$count' }, avgCompletions: { $avg: '$count' } } },
        ])
        .exec(),
    ]);
    return {
      totalAssignments,
      overdue,
      totalCompletions: completionAgg[0]?.totalCompletions ?? 0,
      avgCompletionsPerAssignment: Math.round((completionAgg[0]?.avgCompletions ?? 0) * 10) / 10,
    };
  }
}
