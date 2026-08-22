import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export type NotificationType =
  | 'chat_message'
  | 'channel_message'
  | 'post_comment'
  | 'post_reaction'
  | 'post_share'
  | 'comment_reply'
  | 'comment_reaction'
  | 'qa_answer'
  | 'mention';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  actor: Types.ObjectId | null;

  @Prop({
    required: true,
    enum: ['chat_message', 'channel_message', 'post_comment', 'post_reaction', 'post_share', 'comment_reply', 'comment_reaction', 'qa_answer', 'mention'],
  })
  type: NotificationType;

  @Prop({ type: String, default: null })
  conversationId: string | null;

  @Prop({ type: String, default: null })
  channelId: string | null;

  @Prop({ type: String, default: null })
  groupId: string | null;

  @Prop({ type: String, default: null })
  postId: string | null;

  @Prop({ type: String, default: null })
  questionId: string | null;

  @Prop({ type: String, default: null })
  preview: string | null;

  @Prop({ default: false, index: true })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
