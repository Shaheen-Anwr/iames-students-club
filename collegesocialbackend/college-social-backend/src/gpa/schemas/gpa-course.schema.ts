import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GRADE_LETTERS, GradeLetter } from '../grade-points';

export type GpaCourseDocument = HydratedDocument<GpaCourse>;

// One course row in a student's personal GPA calculator -- fully owner-scoped, no sharing,
// same shape/lifecycle as PlannerTask (src/planner/schemas/planner-task.schema.ts).
@Schema({ timestamps: true })
export class GpaCourse {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0.5, max: 12 })
  creditHours: number;

  // null = not graded yet ("in progress") -- excluded from every GPA figure.
  @Prop({ type: String, enum: GRADE_LETTERS, default: null })
  grade: GradeLetter | null;

  // Free-text term label the student groups courses by, e.g. "الفصل الأول 2024/2025".
  @Prop({ required: true, trim: true })
  term: string;

  // Off for pass/fail or transfer credits that shouldn't move the average.
  @Prop({ default: true })
  countsTowardGpa: boolean;
}

export const GpaCourseSchema = SchemaFactory.createForClass(GpaCourse);
GpaCourseSchema.index({ owner: 1, term: 1 });
