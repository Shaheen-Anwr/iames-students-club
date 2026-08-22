import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

export type AttachmentType = 'image' | 'video' | 'audio' | 'voice' | 'document';

@Schema({ _id: false })
export class Attachment {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true, enum: ['image', 'video', 'audio', 'voice', 'document'] })
  type: AttachmentType;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: Number, default: null })
  size: number | null;

  @Prop({ type: String, default: null })
  mimeType: string | null;

  // Seconds -- only set for 'voice' (recorded notes) and 'audio'/'video' when known client-side.
  @Prop({ type: Number, default: null })
  duration: number | null;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

@Schema({ _id: false })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  emoji: string;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversation: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ required: false, default: '', trim: true })
  text: string;

  @Prop({ type: [AttachmentSchema], default: [] })
  attachments: Attachment[];

  // See the NOTE in conversation.schema.ts's `participants` prop -- `ref` must stay at this
  // outer level for populate() to work at all.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  readBy: Types.ObjectId[];

  // Delivered = reached the recipient's device (socket ack'd receipt), distinct from `readBy`
  // (opened the conversation) -- powers the sent/delivered/read tick states like WhatsApp.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  deliveredTo: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
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

  // Set when this message is a forward of another; only the original text/attachments are
  // copied over at forward time, so this is just a label flag (no live link back).
  @Prop({ default: false })
  forwarded: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  starredBy: Types.ObjectId[];

  // Derived server-side from `text` on send, filtered to ids that are both a real user and a
  // participant of this conversation -- see common/utils/tag-parser.util.ts.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversation: 1, createdAt: -1 });
