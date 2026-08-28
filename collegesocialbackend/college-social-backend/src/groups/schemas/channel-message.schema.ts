import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  Attachment,
  AttachmentSchema,
  Reaction,
  ReactionSchema,
} from '../../chat/schemas/message.schema';

export type ChannelMessageDocument = HydratedDocument<ChannelMessage>;

@Schema({ timestamps: true })
export class ChannelMessage {
  @Prop({ type: Types.ObjectId, ref: 'Channel', required: true, index: true })
  channel: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ required: false, default: '', trim: true })
  text: string;

  // Legacy single-attachment field. Pre-parity messages only wrote here; the client still
  // renders it as a fallback when `attachments` is empty. New sends use `attachments`.
  @Prop({ type: String, required: false, default: null })
  attachmentUrl: string | null;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments: Attachment[];

  @Prop({ type: Types.ObjectId, ref: 'ChannelMessage', default: null })
  replyTo: Types.ObjectId | null;

  @Prop({ type: [ReactionSchema], default: [] })
  reactions: Reaction[];

  @Prop({ default: false })
  edited: boolean;

  @Prop({ type: Date, default: null })
  editedAt: Date | null;

  // Per-user "delete for me" -- hidden from these users but still exists for everyone else.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  deletedFor: Types.ObjectId[];

  @Prop({ default: false })
  deletedForEveryone: boolean;

  // Shape-parity with chat Message; channel messages can't be forwarded yet.
  @Prop({ default: false })
  forwarded: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  starredBy: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];
}

export const ChannelMessageSchema = SchemaFactory.createForClass(ChannelMessage);
ChannelMessageSchema.index({ channel: 1, createdAt: -1 });
