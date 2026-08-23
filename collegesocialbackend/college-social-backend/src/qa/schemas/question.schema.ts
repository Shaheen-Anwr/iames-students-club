import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type QuestionDocument = HydratedDocument<Question>;

export enum QuestionScope {
  PUBLIC = 'public',
  DEPARTMENT = 'department',
}

@Schema({ timestamps: true })
export class Question {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true })
  body: string;

  @Prop({ type: String, required: false, default: null, trim: true, index: true })
  courseCode: string | null;

  @Prop({ type: String, enum: QuestionScope, required: true, default: QuestionScope.PUBLIC, index: true })
  scope: QuestionScope;

  // Snapshotted from the author's department at creation time, same pattern as Post.department.
  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  // Denormalized to avoid an N+1 count query per list item.
  @Prop({ default: 0 })
  answerCount: number;

  // Set only for questions asked inside a study group (by its owner) -- null for every
  // pre-existing global question. Visibility for these is gated by group membership, independent
  // of `scope`/`department` above (which stay PUBLIC/null and are simply unused for group items).
  @Prop({ type: Types.ObjectId, ref: 'StudyGroup', default: null, index: true })
  group: Types.ObjectId | null;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
QuestionSchema.index({ title: 'text', body: 'text' });
QuestionSchema.index({ group: 1, createdAt: -1 });
