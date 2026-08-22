import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ _id: false })
export class MutedEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  // null = muted indefinitely (until manually unmuted)
  @Prop({ type: Date, default: null })
  until: Date | null;
}

export const MutedEntrySchema = SchemaFactory.createForClass(MutedEntry);

@Schema({ _id: false })
export class ClearedEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  // Messages created at/before this timestamp are hidden from this user ("clear chat").
  @Prop({ type: Date, required: true })
  at: Date;
}

export const ClearedEntrySchema = SchemaFactory.createForClass(ClearedEntry);

@Schema({ timestamps: true })
export class Conversation {
  // NOTE: `ref` must sit at this outer level, not nested inside the array's object literal --
  // NestJS's @Prop decorator silently drops the type/ref when nested two levels deep, which
  // makes populate() a silent no-op (participants stay as raw ObjectIds). Verified empirically.
  @Prop({ type: [Types.ObjectId], ref: 'User', required: true, index: true })
  participants: Types.ObjectId[];

  // false = 1-to-1 DM, true = group chat (e.g. a class group)
  @Prop({ default: false })
  isGroup: boolean;

  // Required for group chats, e.g. "CS101 - Section A"
  @Prop({ type: String, required: false, default: null, trim: true })
  name: string | null;

  @Prop({ type: String, required: false, default: null })
  lastMessagePreview: string | null;

  @Prop({ type: Date, required: false, default: null })
  lastMessageAt: Date | null;

  // --- Group chat metadata (isGroup === true only) ---

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  groupIcon: string | null;

  @Prop({ type: String, default: null, trim: true })
  groupDescription: string | null;

  // Group admins -- can add/remove members, edit group info, promote/demote other admins.
  // The group creator is seeded as the first admin at creation time.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  admins: Types.ObjectId[];

  // --- Per-user conversation state (applies to both 1-to-1 and group chats) ---

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  pinnedBy: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  archivedBy: Types.ObjectId[];

  @Prop({ type: [MutedEntrySchema], default: [] })
  mutedBy: MutedEntry[];

  @Prop({ type: [ClearedEntrySchema], default: [] })
  clearedBy: ClearedEntry[];

  // Seconds after which new messages auto-delete for everyone; 0/null = disabled.
  @Prop({ type: Number, default: 0 })
  disappearingSeconds: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
