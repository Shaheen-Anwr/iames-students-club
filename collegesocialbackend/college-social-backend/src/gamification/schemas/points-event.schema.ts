import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Append-only points ledger. `User.points` stays as the denormalised lifetime total (fast
// leaderboard reads); this is the source of truth for anything time-windowed -- "points earned
// this week", a weekly leaderboard that resets by simply moving the window, and honest
// retention analytics. Never updated or deleted after insert.
export type PointsReason =
  | 'post_created'
  | 'reel_created'
  | 'comment_added'
  | 'reply_added'
  | 'reaction_given'
  | 'assignment_completed'
  | 'quiz_attempted'
  | 'daily_active'
  | 'referral_milestone'
  | 'streak_freeze_used'
  | 'admin_adjust'
  | 'other';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PointsEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  /** Signed. Positive for a reward, negative for an admin clawback. */
  @Prop({ required: true })
  delta: number;

  @Prop({ required: true, type: String })
  reason: PointsReason;

  /** Optional free-form context, e.g. { postId }, { quizId }, { adminId }. */
  @Prop({ type: Object, default: null })
  meta: Record<string, unknown> | null;

  createdAt: Date;
}

export type PointsEventDocument = PointsEvent & Document;
export const PointsEventSchema = SchemaFactory.createForClass(PointsEvent);

// "Points earned this week" for one user, and the per-user sum for the weekly leaderboard.
PointsEventSchema.index({ user: 1, createdAt: -1 });
PointsEventSchema.index({ createdAt: -1 });
