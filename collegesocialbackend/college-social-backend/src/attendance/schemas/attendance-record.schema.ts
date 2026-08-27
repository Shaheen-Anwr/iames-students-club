import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'cancelled';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['attended', 'absent', 'excused', 'cancelled'];

export type AttendanceRecordDocument = HydratedDocument<AttendanceRecord>;

// A student's mark against ONE occurrence of a scheduled lecture. The list of lectures itself is
// never stored -- it's expanded on the fly from the published weekly timetable (ScheduleEntry)
// for the student's group, see AttendanceService.getWeek. Only the marks live here.
@Schema({ timestamps: true })
export class AttendanceRecord {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  // Which weekly session this mark belongs to.
  @Prop({ type: Types.ObjectId, ref: 'ScheduleEntry', required: true })
  scheduleEntry: Types.ObjectId;

  // The specific calendar day of the occurrence, normalised to 00:00:00.000 UTC.
  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: String, enum: ATTENDANCE_STATUSES, required: true })
  status: AttendanceStatus;

  // Snapshot of ScheduleEntry.courseName at mark time -- keeps history/stats intact if the
  // timetable entry is later renamed or deleted (same snapshot idea as PostsService.create).
  @Prop({ required: true, trim: true })
  courseName: string;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
// One mark per student per session per day.
AttendanceRecordSchema.index({ owner: 1, scheduleEntry: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ owner: 1, date: 1 });
