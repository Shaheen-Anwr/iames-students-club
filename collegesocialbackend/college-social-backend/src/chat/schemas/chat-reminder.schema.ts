import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatReminderDocument = HydratedDocument<ChatReminder>;

// "ذكّرني" -- a user asked to be reminded about one chat message at a given time. Private to that
// user (nobody else in the conversation sees it). Delivered by ChatRemindersService's sweep as a
// 'chat_reminder' notification (bell + push) that opens the conversation at that message.
@Schema({ timestamps: true })
export class ChatReminder {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Message', required: true })
  message: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversation: Types.ObjectId;

  @Prop({ type: Date, required: true })
  remindAt: Date;

  // Snapshot of the message for the reminder's text, so a later edit/delete can't blank it.
  @Prop({ type: String, default: '' })
  preview: string;

  // The message's own timestamp -- the deep link needs it to load history around the message.
  @Prop({ type: Date, required: true })
  messageCreatedAt: Date;

  // pending -> sending (claimed by a sweep) -> sent; or canceled by the user.
  @Prop({ type: String, enum: ['pending', 'sending', 'sent', 'canceled'], default: 'pending' })
  status: 'pending' | 'sending' | 'sent' | 'canceled';
}

export const ChatReminderSchema = SchemaFactory.createForClass(ChatReminder);
// The sweep's query: due + still pending, oldest first.
ChatReminderSchema.index({ status: 1, remindAt: 1 });
ChatReminderSchema.index({ user: 1, message: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
