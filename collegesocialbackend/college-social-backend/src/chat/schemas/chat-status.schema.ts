import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatStatusDocument = HydratedDocument<ChatStatus>;

@Schema({ timestamps: true })
export class ChatStatus {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ default: '', maxlength: 600 })
  text: string;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ required: true })
  expiresAt: Date;
}

export const ChatStatusSchema = SchemaFactory.createForClass(ChatStatus);
ChatStatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ChatStatusSchema.index({ author: 1, expiresAt: -1 });
