import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MilitaryCheckInDocument = HydratedDocument<MilitaryCheckIn>;

// One row per student per day they logged attendance during the military-education camp.
// The consecutive-day streak is derived from these rows (see MilitaryService), deliberately kept
// separate from the global login streak in gamification/ so it only counts days inside the camp.
@Schema({ timestamps: true })
export class MilitaryCheckIn {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  // Normalized to UTC midnight of the check-in day, so the { user, date } unique index below
  // makes a second check-in on the same day a no-op.
  @Prop({ type: Date, required: true })
  date: Date;
}

export const MilitaryCheckInSchema = SchemaFactory.createForClass(MilitaryCheckIn);
MilitaryCheckInSchema.index({ user: 1, date: 1 }, { unique: true });
