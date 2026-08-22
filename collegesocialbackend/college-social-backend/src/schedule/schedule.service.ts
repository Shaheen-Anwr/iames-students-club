import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScheduleEntry, ScheduleEntryDocument } from './schemas/schedule-entry.schema';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { UsersService } from '../users/users.service';
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

@Injectable()
export class ScheduleService {
  constructor(
    @InjectModel(ScheduleEntry.name) private scheduleModel: Model<ScheduleEntryDocument>,
    private readonly usersService: UsersService,
  ) {}

  // --- Admin-only writes (guarded at the controller level) ---

  async create(adminId: string, dto: CreateScheduleEntryDto): Promise<ScheduleEntryDocument> {
    this.assertValidRange(dto.startTime, dto.endTime);
    const group = { department: dto.department, academicYear: dto.academicYear, specialization: dto.specialization };
    await this.assertNoOverlap(group, dto.dayOfWeek, dto.startTime, dto.endTime);

    const entry = new this.scheduleModel({
      createdBy: new Types.ObjectId(adminId),
      department: dto.department,
      academicYear: dto.academicYear,
      specialization: dto.specialization,
      dayOfWeek: dto.dayOfWeek,
      courseName: dto.courseName,
      startTime: dto.startTime,
      endTime: dto.endTime,
      location: dto.location ?? null,
    });
    return entry.save();
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
