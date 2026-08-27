import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MilitaryScheduleItemDocument = HydratedDocument<MilitaryScheduleItem>;

// One dated session/period of the التربية العسكرية program. The whole collection is replaced
// wholesale each time an admin uploads a CSV (see MilitaryService.replaceScheduleFromCsv).
@Schema({ timestamps: true })
export class MilitaryScheduleItem {
  @Prop({ type: Date, required: true, index: true })
  date: Date;

  @Prop({ required: true, trim: true })
  title: string;

  // "HH:mm", 24h -- same convention as ScheduleEntry.
  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ type: String, required: false, default: null, trim: true })
  location: string | null;
}

export const MilitaryScheduleItemSchema = SchemaFactory.createForClass(MilitaryScheduleItem);
MilitaryScheduleItemSchema.index({ date: 1, startTime: 1 });
