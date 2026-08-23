import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type QuizDocument = HydratedDocument<Quiz>;

@Schema({ _id: false })
export class QuizQuestion {
  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ type: [String], required: true })
  options: string[];

  @Prop({ required: true })
  correctIndex: number;
}
export const QuizQuestionSchema = SchemaFactory.createForClass(QuizQuestion);

@Schema({ _id: false })
export class QuizAttempt {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: [Number], required: true })
  answers: number[];

  @Prop({ required: true })
  score: number;

  @Prop({ type: Date, default: Date.now })
  submittedAt: Date;
}
export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);

@Schema({ timestamps: true })
export class Quiz {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, trim: true, default: '' })
  description: string;

  @Prop({ type: String, required: false, trim: true, default: null })
  courseCode: string | null;

  @Prop({ type: [QuizQuestionSchema], required: true })
  questions: QuizQuestion[];

  // Every attempt is kept (not just the latest) so QuizzesService can enforce one-attempt-per-user
  // and still answer "did this viewer already take it" without a second collection, mirroring
  // Assignment.completedBy's embedded-array approach.
  @Prop({ type: [QuizAttemptSchema], default: [] })
  attempts: QuizAttempt[];

  // Set only for quizzes created inside a study group (by its owner) -- null for every
  // pre-existing global quiz. Visibility for these is gated by group membership.
  @Prop({ type: Types.ObjectId, ref: 'StudyGroup', default: null, index: true })
  group: Types.ObjectId | null;
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);
QuizSchema.index({ group: 1, createdAt: -1 });
