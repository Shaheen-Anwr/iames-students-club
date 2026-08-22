import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnswerDocument = HydratedDocument<Answer>;

@Schema({ timestamps: true })
export class Answer {
  @Prop({ type: Types.ObjectId, ref: 'Question', required: true, index: true })
  question: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true })
  body: string;

  // `ref` must sit at this outer level -- see the note in chat/schemas/conversation.schema.ts's
  // `participants` prop for why.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  upvotes: Types.ObjectId[];

  // Set by the question's author only -- at most one accepted answer per question.
  @Prop({ default: false })
  isAccepted: boolean;
}

export const AnswerSchema = SchemaFactory.createForClass(Answer);
