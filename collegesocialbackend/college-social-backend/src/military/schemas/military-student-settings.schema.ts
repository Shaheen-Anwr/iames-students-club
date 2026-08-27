import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MilitaryStudentSettingsDocument = HydratedDocument<MilitaryStudentSettings>;

// Per-student personal daily time window for التربية العسكرية ("my session runs from -> to").
// One document per user, upserted from the section (see MilitaryService.updateSettings).
@Schema({ timestamps: true })
export class MilitaryStudentSettings {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user: Types.ObjectId;

  // "HH:mm", 24h. Null until the student sets them.
  @Prop({ type: String, default: null })
  dailyStartTime: string | null;

  @Prop({ type: String, default: null })
  dailyEndTime: string | null;
}

export const MilitaryStudentSettingsSchema = SchemaFactory.createForClass(MilitaryStudentSettings);
