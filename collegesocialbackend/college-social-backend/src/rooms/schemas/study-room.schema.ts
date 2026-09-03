import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type StudyRoomDocument = HydratedDocument<StudyRoom>;

// One member's presence in a room.
@Schema({ _id: false })
export class RoomMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() })
  joinedAt: Date;
}
export const RoomMemberSchema = SchemaFactory.createForClass(RoomMember);

// A shared Pomodoro timer for the room -- collaborative: any member can start/pause/skip it.
// The countdown itself is computed client-side from `endsAt`, so this needs no realtime push;
// clients just re-poll GET /rooms/:id every few seconds.
@Schema({ _id: false })
export class RoomTimer {
  @Prop({ type: String, enum: ['focus', 'break'], default: 'focus' })
  phase: 'focus' | 'break';

  @Prop({ type: Boolean, default: false })
  running: boolean;

  // When the current phase ends. null unless `running`.
  @Prop({ type: Date, default: null })
  endsAt: Date | null;

  // Remaining ms captured on pause, so "start" resumes instead of restarting the phase.
  @Prop({ type: Number, default: null })
  pausedRemainingMs: number | null;

  @Prop({ type: Number, default: 25 })
  focusMin: number;

  @Prop({ type: Number, default: 5 })
  breakMin: number;
}
export const RoomTimerSchema = SchemaFactory.createForClass(RoomTimer);

// A live "study together" room -- a lobby with a shared Pomodoro. شعبة-scoped like the rest of
// the platform (null = whole college). Empty rooms are deleted when the last member leaves.
@Schema({ timestamps: true })
export class StudyRoom {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  topic: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ type: [RoomMemberSchema], default: [] })
  members: RoomMember[];

  @Prop({ type: RoomTimerSchema, default: () => ({}) })
  timer: RoomTimer;

  // Bumped on any join / leave / timer action -- used to prune abandoned rooms.
  @Prop({ type: Date, default: () => new Date(), index: true })
  lastActiveAt: Date;

  // Scheduled rooms: set when a student books a session ahead of time. Until this passes the room
  // shows as "upcoming"; after, it's an ordinary live room. null = ad-hoc room, live immediately.
  @Prop({ type: Date, default: null, index: true })
  scheduledFor: Date | null;

  // RoomsService.sendScheduledReminders stamps this once it has pushed the host's friends about
  // an imminent scheduled session, so the cron never double-notifies.
  @Prop({ type: Date, default: null })
  reminderSentAt: Date | null;

  // Friends already pinged "your friend is studying here" for THIS room, so a re-join doesn't spam.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  notifiedUserIds: Types.ObjectId[];
}

export const StudyRoomSchema = SchemaFactory.createForClass(StudyRoom);
StudyRoomSchema.index({ department: 1, lastActiveAt: -1 });
StudyRoomSchema.index({ scheduledFor: 1, reminderSentAt: 1 });
