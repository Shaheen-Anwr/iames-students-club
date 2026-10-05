import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  CALL_OUTCOMES,
  CARD_KINDS,
  CHAT_BOTS,
  MESSAGE_EFFECTS,
  type CallKind,
  type CallOutcome,
  type CardKind,
  type ChatBot,
  type MessageEffect,
} from '../chat.constants';

export type MessageDocument = HydratedDocument<Message>;

// 'sticker' = an image sent as a sticker: rendered bubble-less, larger than an emoji.
export type AttachmentType = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';

@Schema({ _id: false })
export class Attachment {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true, enum: ['image', 'video', 'audio', 'voice', 'document', 'sticker'] })
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

  // Set when this attachment was too large for a single Cloudinary raw asset and got split (see
  // StorageService.upload()'s chunked path) -- null/1 for an ordinary unsplit attachment. Only ever
  // set for 'document' attachments (images/video/audio aren't split this way). Needed to
  // reconstruct the full file on read; see ChatController's/GroupsController's attachment-download
  // routes. Shared by ChannelMessage's `attachments`, which reuses this same schema.
  @Prop({ type: Number, default: null })
  chunkCount: number | null;

  // Speech-to-text of a voice note, generated once on first request and shared by everyone who
  // can see the message (ChatAiService.transcribe). null until someone asks.
  @Prop({ type: String, default: null })
  transcript: string | null;
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

@Schema({ _id: false })
export class PollOption {
  // Short, stable id ("o1", "o2", ...) that clients vote by -- an array index would silently
  // re-point votes if the options were ever reordered.
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  voters: Types.ObjectId[];
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

// Quiz mode for a poll (the class group's daily question): one option is correct, a vote is
// final, and the answer + explanation are revealed to each voter once they've picked.
@Schema({ _id: false })
export class PollQuiz {
  @Prop({ required: true })
  correctOptionId: string;

  @Prop({ default: '' })
  explanation: string;
}

export const PollQuizSchema = SchemaFactory.createForClass(PollQuiz);
// Answers remain available to server-side scoring, but never travel in normal REST/socket
// message payloads (including newly-created documents and populated reply previews).
// A non-empty marker (an empty object would be minimized away) so clients still know it's a quiz.
PollQuizSchema.set('toJSON', {
  transform: () => ({ answerHidden: true }),
});

@Schema({ _id: false })
export class Poll {
  @Prop({ required: true, trim: true })
  question: string;

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  // true = a voter may tick several options; false = single choice (a new pick replaces the old).
  @Prop({ default: false })
  multiple: boolean;

  // Set by the poll's creator: voting is frozen, results stay visible.
  @Prop({ default: false })
  closed: boolean;

  // null = an ordinary poll.
  @Prop({ type: PollQuizSchema, default: null })
  quiz: PollQuiz | null;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// A platform item shared into the chat (lecture/post, assignment, event, marketplace listing, a
// status reply). A snapshot taken at send time by ChatCardsService from the real document -- never
// client-supplied text -- plus the in-app link; opening it re-checks access on the target page.
@Schema({ _id: false })
export class MessageCard {
  @Prop({ type: String, enum: [...CARD_KINDS], required: true })
  kind: CardKind;

  @Prop({ required: true })
  refId: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, default: null })
  subtitle: string | null;

  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ required: true })
  href: string;

  // Kind-specific extras the card renders live (e.g. a countdown): assignment dueAt, event startsAt,
  // listing price/status, lecture courseCode. Small and flat on purpose.
  @Prop({ type: Object, default: null })
  meta: Record<string, string | number | boolean | null> | null;
}

export const MessageCardSchema = SchemaFactory.createForClass(MessageCard);

// When one participant received / read one message -- the timestamped twin of the plain
// `deliveredTo` / `readBy` id arrays, which stay the source of truth for tick state.
@Schema({ _id: false })
export class Receipt {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Date, required: true })
  at: Date;
}

export const ReceiptSchema = SchemaFactory.createForClass(Receipt);

// A call record shown in the thread ("مكالمة صوتية · 3:24", "مكالمة فائتة"). The message's
// sender is the caller; written once per call (unique on callId).
@Schema({ _id: false })
export class CallLog {
  @Prop({ required: true })
  callId: string;

  @Prop({ type: String, enum: ['audio', 'video'], required: true })
  type: CallKind;

  @Prop({ type: String, enum: [...CALL_OUTCOMES], required: true })
  outcome: CallOutcome;

  // Seconds connected (completed calls only).
  @Prop({ type: Number, default: 0 })
  duration: number;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversation: Types.ObjectId;

  // null only for bot messages (see `bot`) -- and, as before, when the sender's account is gone.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sender: Types.ObjectId | null;

  // Set on messages with no human sender: 'rafed' (the AI assistant) or 'system' (class-group
  // posts). Bot messages are always notification-silent.
  @Prop({ type: String, enum: [...CHAT_BOTS], default: null })
  bot: ChatBot | null;

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

  // A poll message: `text` is empty and the question/options live here. null for every
  // ordinary message. Votes are written with an atomic pipeline update (ChatService.votePoll),
  // never a read-modify-save, so concurrent voters can't overwrite each other.
  @Prop({ type: PollSchema, default: null })
  poll: Poll | null;

  // Optional "send with effect" celebration the client plays once when the message arrives.
  @Prop({ type: String, enum: [...MESSAGE_EFFECTS], default: null })
  effect: MessageEffect | null;

  // Per-recipient timestamps for the sender's "message info" view. `select: false` keeps them out
  // of every normal payload (a large group would otherwise ship N receipts with each message) --
  // only GET /chat/messages/:id/info asks for them with `+readReceipts +deliveryReceipts`.
  @Prop({ type: [ReceiptSchema], default: [], select: false })
  readReceipts: Receipt[];

  @Prop({ type: [ReceiptSchema], default: [], select: false })
  deliveryReceipts: Receipt[];

  // Set only on call-log messages (text empty).
  @Prop({ type: CallLogSchema, default: null })
  call: CallLog | null;

  @Prop({ type: MessageCardSchema, default: null })
  card: MessageCard | null;

  // --- Threads (group chats) ---
  // A reply posted in a message's thread: kept out of the main timeline, unread counts and the
  // chat-list preview; shown in the thread panel instead. null for every ordinary message.
  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  threadRoot: Types.ObjectId | null;

  // On a thread's ROOT message only: how many replies, when the last one landed, and the most
  // recent repliers (for the "N ردود" chip's avatars; capped at 3).
  @Prop({ default: 0 })
  threadCount: number;

  @Prop({ type: Date, default: null })
  threadLastAt: Date | null;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  threadParticipants: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversation: 1, createdAt: -1 });
// A thread's replies, in order (sparse-ish: the partial filter keeps ordinary messages out).
MessageSchema.index(
  { threadRoot: 1, createdAt: 1 },
  { partialFilterExpression: { threadRoot: { $type: 'objectId' } } },
);
// One log message per call, even if the caller's client reports twice (retry, second tab).
MessageSchema.index(
  { 'call.callId': 1 },
  { unique: true, partialFilterExpression: { 'call.callId': { $type: 'string' } } },
);
