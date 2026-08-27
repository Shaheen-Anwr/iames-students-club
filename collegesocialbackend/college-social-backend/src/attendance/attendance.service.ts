import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AttendanceRecord, AttendanceRecordDocument, AttendanceStatus } from './schemas/attendance-record.schema';
import { SetAttendanceDto } from './dto/set-attendance.dto';
import { ScheduleService } from '../schedule/schedule.service';

export interface AttendanceOccurrence {
  scheduleEntryId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  courseName: string;
  startTime: string;
  endTime: string;
  location: string | null;
  status: AttendanceStatus | null;
}

export interface AttendanceCourseSummary {
  courseName: string;
  attended: number;
  absent: number;
  excused: number;
  cancelled: number;
  counted: number; // attended + absent
  percent: number; // attended / counted, 0..100
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight-UTC Date for the calendar day of an ISO string -- so a mark is anchored to a day, not
// a client's local time.
function dayUtc(iso: string): Date {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ غير صالح');
  return d;
}

function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name) private attendanceModel: Model<AttendanceRecordDocument>,
    private readonly scheduleService: ScheduleService,
  ) {}

  // The student's own weekly timetable expanded into 7 dated days starting at `startIso`, each
  // scheduled session annotated with the mark the student has saved for it (or null = unmarked).
  async getWeek(ownerId: string, startIso: string): Promise<{ weekStart: string; occurrences: AttendanceOccurrence[] }> {
    const weekStart = dayUtc(startIso);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const entries = await this.scheduleService.findForUser(ownerId);

    const records = await this.attendanceModel
      .find({ owner: new Types.ObjectId(ownerId), date: { $gte: weekStart, $lt: weekEnd } })
      .exec();
    const marks = new Map<string, AttendanceStatus>();
    for (const r of records) marks.set(`${r.scheduleEntry.toString()}|${toDayString(r.date)}`, r.status);

    const occurrences: AttendanceOccurrence[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart.getTime() + i * DAY_MS);
      const dow = day.getUTCDay();
      const dayStr = toDayString(day);
      for (const entry of entries) {
        if (entry.dayOfWeek !== dow) continue;
        const entryId = entry._id.toString();
        occurrences.push({
          scheduleEntryId: entryId,
          date: dayStr,
          dayOfWeek: dow,
          courseName: entry.courseName,
          startTime: entry.startTime,
          endTime: entry.endTime,
          location: entry.location ?? null,
          status: marks.get(`${entryId}|${dayStr}`) ?? null,
        });
      }
    }

    occurrences.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
    return { weekStart: toDayString(weekStart), occurrences };
  }

  // Upsert the mark for one occurrence; `status: null` clears it (back to "unmarked").
  async setStatus(ownerId: string, dto: SetAttendanceDto): Promise<{ status: AttendanceStatus | null }> {
    const date = dayUtc(dto.date);
    const entries = await this.scheduleService.findForUser(ownerId);
    const entry = entries.find((e) => e._id.toString() === dto.scheduleEntryId);
    if (!entry) throw new NotFoundException('هذه الحصة ليست ضمن جدولك الدراسي');
    if (entry.dayOfWeek !== date.getUTCDay()) {
      throw new BadRequestException('هذه المحاضرة ليست في هذا اليوم');
    }

    const query = { owner: new Types.ObjectId(ownerId), scheduleEntry: entry._id, date };
    if (dto.status === null) {
      await this.attendanceModel.deleteOne(query).exec();
      return { status: null };
    }

    await this.attendanceModel
      .findOneAndUpdate(query, { $set: { status: dto.status, courseName: entry.courseName } }, { upsert: true })
      .exec();
    return { status: dto.status };
  }

  // All-time attendance, grouped by the (snapshotted) course name, plus an overall row.
  async getSummaryForOwner(ownerId: string): Promise<{ courses: AttendanceCourseSummary[]; overall: AttendanceCourseSummary }> {
    const rows = await this.attendanceModel
      .aggregate<{ _id: string; attended: number; absent: number; excused: number; cancelled: number }>([
        { $match: { owner: new Types.ObjectId(ownerId) } },
        {
          $group: {
            _id: '$courseName',
            attended: { $sum: { $cond: [{ $eq: ['$status', 'attended'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            excused: { $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    const toSummary = (name: string, r: { attended: number; absent: number; excused: number; cancelled: number }): AttendanceCourseSummary => {
      const counted = r.attended + r.absent;
      return {
        courseName: name,
        attended: r.attended,
        absent: r.absent,
        excused: r.excused,
        cancelled: r.cancelled,
        counted,
        percent: counted ? Math.round((r.attended / counted) * 100) : 0,
      };
    };

    const courses = rows.map((r) => toSummary(r._id, r));
    const totals = courses.reduce(
      (acc, c) => ({
        attended: acc.attended + c.attended,
        absent: acc.absent + c.absent,
        excused: acc.excused + c.excused,
        cancelled: acc.cancelled + c.cancelled,
      }),
      { attended: 0, absent: 0, excused: 0, cancelled: 0 },
    );

    return { courses, overall: toSummary('الإجمالي', totals) };
  }
}
