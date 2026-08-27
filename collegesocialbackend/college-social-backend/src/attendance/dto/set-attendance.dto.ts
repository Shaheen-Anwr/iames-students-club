import { IsIn, IsISO8601, IsMongoId } from 'class-validator';
import { ATTENDANCE_STATUSES, AttendanceStatus } from '../schemas/attendance-record.schema';

export class SetAttendanceDto {
  @IsMongoId({ message: 'حصة غير صالحة' })
  scheduleEntryId: string;

  // "YYYY-MM-DD" (or any ISO-8601) -- the specific occurrence's calendar day.
  @IsISO8601({}, { message: 'تاريخ غير صالح' })
  date: string;

  // A status, or null to clear the mark (back to "unmarked").
  @IsIn([...ATTENDANCE_STATUSES, null], { message: 'حالة الحضور غير صالحة' })
  status: AttendanceStatus | null;
}
