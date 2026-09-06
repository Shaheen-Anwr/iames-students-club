import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type ScheduleBoardDocument = HydratedDocument<ScheduleBoard>;

// The "just upload a photo of the whole timetable" alternative to building it lecture-by-lecture
// via ScheduleEntry -- one photo (+ optional note) per department/academicYear/specialization
// group, admin/professor-published. Uploading (or replacing) one also auto-posts to the main feed,
// same as ScheduleEntry -- see ScheduleService.upsertBoard()/postFeedAnnouncement().
@Schema({ timestamps: true })
export class ScheduleBoard {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  updatedBy: Types.ObjectId;

  @Prop({ type: String, enum: Department, required: true, index: true })
  department: Department;

  @Prop({ type: String, enum: AcademicYear, required: true, index: true })
  academicYear: AcademicYear;

  @Prop({ type: String, enum: Specialization, required: true, index: true })
  specialization: Specialization;

  @Prop({ required: true })
  photoUrl: string;

  @Prop({ type: String, required: false, default: null, trim: true, maxlength: 1500 })
  description: string | null;
}

export const ScheduleBoardSchema = SchemaFactory.createForClass(ScheduleBoard);
// One board per group -- upsertBoard() replaces the existing document for a group rather than
// accumulating a history of old timetable photos.
ScheduleBoardSchema.index({ department: 1, academicYear: 1, specialization: 1 }, { unique: true });
