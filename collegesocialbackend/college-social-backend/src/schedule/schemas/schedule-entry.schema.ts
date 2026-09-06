import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type ScheduleEntryDocument = HydratedDocument<ScheduleEntry>;

// The official weekly timetable for one department/academicYear/specialization group --
// admin/professor-published, read by every student and professor in that group (see
// ScheduleService). Creating an entry also auto-posts it to the main feed (scoped to the same
// department, public otherwise) so it reaches everyone there too -- students and professors
// alike, same as any other department-tagged post (see PostsService.buildFeedFilter()).
@Schema({ timestamps: true })
export class ScheduleEntry {
  // The admin who published this entry -- audit only, not used for access control (mirrors
  // Post.author).
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: String, enum: Department, required: true, index: true })
  department: Department;

  @Prop({ type: String, enum: AcademicYear, required: true, index: true })
  academicYear: AcademicYear;

  @Prop({ type: String, enum: Specialization, required: true, index: true })
  specialization: Specialization;

  // 0 = Sunday .. 6 = Saturday, matching JS Date#getDay().
  @Prop({ type: Number, required: true, min: 0, max: 6 })
  dayOfWeek: number;

  @Prop({ required: true, trim: true })
  courseName: string;

  // "HH:mm", 24h.
  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ type: String, required: false, default: null, trim: true })
  location: string | null;

  // Optional free-text note shown alongside the entry (e.g. "احضروا الحاسوب المحمول") and echoed
  // into the auto-posted feed post below -- see ScheduleService.create().
  @Prop({ type: String, required: false, default: null, trim: true, maxlength: 1500 })
  description: string | null;

  // A photo of the physical timetable/board, uploaded via the same POST /upload/post-images
  // endpoint the marketplace/feed composer use (see ScheduleEntryForm.tsx) -- the URL is just
  // attached here and to the auto-posted feed post, no dedicated upload route needed.
  @Prop({ type: String, required: false, default: null })
  photoUrl: string | null;
}

export const ScheduleEntrySchema = SchemaFactory.createForClass(ScheduleEntry);
ScheduleEntrySchema.index({ department: 1, academicYear: 1, specialization: 1, dayOfWeek: 1 });
