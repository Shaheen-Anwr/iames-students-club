import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Attachment, AttachmentSchema } from './message.schema';
import { MESSAGE_EFFECTS, type MessageEffect } from '../chat.constants';

export type ScheduledMessageDocument = HydratedDocument<ScheduledMessage>;

export type ScheduledMessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';

// The poll as the sender typed it -- votes don't exist until it's actually sent.
@Schema({ _id: false })
export class ScheduledPoll {
  @Prop({ required: true, trim: true })
  question: string;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ default: false })
  multiple: boolean;
}

export const ScheduledPollSchema = SchemaFactory.createForClass(ScheduledPoll);

// A message queued to go out later ("send later", Telegram-style). ChatSchedulerService claims due
// rows atomically (pending -> sending) and runs them through ChatService.saveMessage -- the exact
// path a live send takes -- so blocks, membership, mentions and notifications are all re-checked
// at delivery time rather than trusted from when it was scheduled.
@Schema({ timestamps: true })
export class ScheduledMessage {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversation: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ default: '' })
  text: string;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments: Attachment[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  replyTo: Types.ObjectId | null;

  @Prop({ type: ScheduledPollSchema, default: null })
  poll: ScheduledPoll | null;

  @Prop({ type: String, enum: [...MESSAGE_EFFECTS], default: null })
  effect: MessageEffect | null;

  @Prop({ default: false })
  silent: boolean;

  @Prop({ type: Date, required: true })
  sendAt: Date;

  @Prop({ type: String, enum: ['pending', 'sending', 'sent', 'failed', 'canceled'], default: 'pending' })
  status: ScheduledMessageStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  sentMessage: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  error: string | null;
}

export const ScheduledMessageSchema = SchemaFactory.createForClass(ScheduledMessage);
// The delivery sweep: "pending rows whose time has come", oldest first.
ScheduledMessageSchema.index({ status: 1, sendAt: 1 });
// A sender's queue for one conversation (and the per-user pending cap).
ScheduledMessageSchema.index({ sender: 1, status: 1, conversation: 1, sendAt: 1 });
