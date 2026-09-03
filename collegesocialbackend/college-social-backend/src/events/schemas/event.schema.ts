import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type EventDocument = HydratedDocument<Event>;

// A campus event / club meeting. Any authenticated user can create one; `organizer` is a
// free-text club or society name (no separate Club entity yet). شعبة-scoped the same way as
// posts/announcements/wall: null = whole college, else that department only.
@Schema({ timestamps: true })
export class Event {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ default: '', trim: true })
  location: string;

  @Prop({ default: '', trim: true })
  organizer: string;

  @Prop({ type: Date, required: true, index: true })
  startsAt: Date;

  @Prop({ type: Date, default: null })
  endsAt: Date | null;

  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  attendees: Types.ObjectId[];

  // null = unlimited. When set, RSVP is refused once attendees.length reaches it.
  @Prop({ type: Number, default: null })
  capacity: number | null;

  // Set once EventReminderService has pushed the "starts soon" notification to attendees, so the
  // hourly cron never double-notifies.
  @Prop({ type: Date, default: null })
  reminderSentAt: Date | null;
}

export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ department: 1, startsAt: 1 });
// EventReminderService's hourly cron: unsent reminders for events starting in the next few hours.
EventSchema.index({ reminderSentAt: 1, startsAt: 1 });
