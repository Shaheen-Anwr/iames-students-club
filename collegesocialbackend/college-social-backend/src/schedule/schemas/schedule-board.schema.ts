import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type ScheduleBoardDocument = HydratedDocument<ScheduleBoard>;

// The "just upload a photo of the whole timetable" alternative to building it lecture-by-lecture
// via ScheduleEntry -- any number of photos (+ optional note each) per
// department/academicYear/specialization group, admin/professor-published (e.g. one per term, or
// multiple pages of the same printed table). Adding one also auto-posts to the main feed, same as
// ScheduleEntry -- see ScheduleService.addBoard()/postBoardFeedAnnouncement().
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

  // Show/hide toggle, replacing a hard delete in the UI (ScheduleBoardPhoto.tsx) -- an admin can
  // flip an old term's photo off without losing it, and flip it back on later. Students/professors
  // only ever see active:true ones (see ScheduleService.getBoardsForGroup()'s includeInactive gate).
  @Prop({ type: Boolean, default: true, index: true })
  active: boolean;
}

export const ScheduleBoardSchema = SchemaFactory.createForClass(ScheduleBoard);
// Not unique -- a group can have any number of board photos now (see class comment above).
ScheduleBoardSchema.index({ department: 1, academicYear: 1, specialization: 1, createdAt: 1 });
