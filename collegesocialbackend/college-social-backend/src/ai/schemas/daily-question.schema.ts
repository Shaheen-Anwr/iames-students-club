import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DailyQuestionDocument = HydratedDocument<DailyQuestion>;

// One row per class group per day the daily question (سؤال اليوم) was posted. The unique
// (classKey, day) index makes posting idempotent across instances/restarts, and `questionKey`
// lets the picker avoid repeating a question a class has already had.
@Schema({ timestamps: true })
export class DailyQuestion {
  @Prop({ required: true })
  classKey: string;

  // YYYY-MM-DD in the app's timezone.
  @Prop({ required: true })
  day: string;

  // Normalized question text -- the "already asked" fingerprint.
  @Prop({ required: true })
  questionKey: string;

  // Where it came from: a lecture's cached study-kit quiz, or generated from lecture text.
  @Prop({ type: String, enum: ['kit', 'generated'], required: true })
  source: 'kit' | 'generated';

  @Prop({ type: Types.ObjectId, ref: 'Post', default: null })
  lecture: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  message: Types.ObjectId | null;
}

export const DailyQuestionSchema = SchemaFactory.createForClass(DailyQuestion);
DailyQuestionSchema.index({ classKey: 1, day: 1 }, { unique: true });
DailyQuestionSchema.index({ classKey: 1, questionKey: 1 });
