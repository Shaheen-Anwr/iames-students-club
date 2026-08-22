import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlannerTaskDocument = HydratedDocument<PlannerTask>;

// A student's personal to-do list -- fully owner-scoped, no sharing between users, same shape
// as ScheduleEntry (src/schedule/schemas/schedule-entry.schema.ts).
@Schema({ timestamps: true })
export class PlannerTask {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, default: null, trim: true })
  notes: string | null;

  // Nullable: a task doesn't have to have a due date to exist ("someday" tasks).
  @Prop({ type: Date, default: null, index: true })
  dueDate: Date | null;

  @Prop({ default: false })
  done: boolean;

  @Prop({ type: String, default: null, trim: true })
  courseCode: string | null;
}

export const PlannerTaskSchema = SchemaFactory.createForClass(PlannerTask);
PlannerTaskSchema.index({ owner: 1, done: 1, dueDate: 1 });
