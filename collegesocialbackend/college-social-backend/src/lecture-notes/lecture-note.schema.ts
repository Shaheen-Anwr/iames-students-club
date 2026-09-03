import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// A student's private note on a lecture/material post -- their own study annotations, never shared.
// One per (user, post); an empty body deletes it.
@Schema({ timestamps: true })
export class LectureNote {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  post: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  body: string;

  updatedAt: Date;
}

export type LectureNoteDocument = LectureNote & Document;
export const LectureNoteSchema = SchemaFactory.createForClass(LectureNote);
LectureNoteSchema.index({ user: 1, post: 1 }, { unique: true });
