import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CalendarEventDocument = HydratedDocument<CalendarEvent>;

// A student's own calendar entries -- "event" (a marker, no alert) or "reminder" (fires a push
// notification at `time` via CalendarEventsService's cron). Fully owner-scoped, same shape as
// PlannerTask (src/planner/schemas/planner-task.schema.ts). Distinct from PlannerTask: a task is
// a to-do (has `done`, date optional); these always have a date and are never "completed", just
// markers/alerts on a day.
@Schema({ timestamps: true })
export class CalendarEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, default: null, trim: true })
  notes: string | null;

  // UTC-midnight of the day, same convention as Assignment.dueDate/PlannerTask.dueDate.
  @Prop({ type: Date, required: true, index: true })
  date: Date;

  // "HH:mm", 24h. Required for kind 'reminder' (enforced in the service, not the schema, so the
  // same document shape covers both kinds); optional for 'event'.
  @Prop({ type: String, default: null })
  time: string | null;

  @Prop({ type: String, enum: ['event', 'reminder'], required: true })
  kind: 'event' | 'reminder';

  // Only meaningful for kind 'reminder' -- flips to true once the cron has actually sent the push,
  // so a server restart or a slow tick never double-sends the same reminder.
  @Prop({ default: false })
  notified: boolean;
}

export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);
CalendarEventSchema.index({ owner: 1, date: 1 });
