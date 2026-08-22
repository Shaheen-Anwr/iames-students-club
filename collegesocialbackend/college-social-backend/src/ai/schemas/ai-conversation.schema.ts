import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiConversationDocument = HydratedDocument<AiConversation>;

@Schema({ timestamps: true })
export class AiConversation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  // Auto-derived from the first user message; null until the first message is sent.
  @Prop({ type: String, default: null, trim: true })
  title: string | null;
}

export const AiConversationSchema = SchemaFactory.createForClass(AiConversation);
