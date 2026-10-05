import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
import { hasFormatting, stripFormatting } from './chat-format';
import type { Conversation, Message, User } from './types';

// Filters out the current user, and drops any participant whose account was since deleted
// (or, defensively, any entry that wasn't populated into a full User object).
export function otherParticipants(conversation: Conversation, currentUserId: string): User[] {
  return conversation.participants.filter(
    (p): p is User => !!p && typeof p === 'object' && p._id !== currentUserId,
  );
}

export function conversationTitle(conversation: Conversation, currentUserId: string): string {
  if (conversation.isGroup) return conversation.name ?? 'محادثة جماعية';
  const others = otherParticipants(conversation, currentUserId);
  return others[0]?.name ?? 'مستخدم غير معروف';
}

export function conversationAvatarUser(conversation: Conversation, currentUserId: string): User | undefined {
  if (conversation.isGroup) return undefined;
  return otherParticipants(conversation, currentUserId)[0];
}

export function isPinned(conversation: Conversation, userId: string): boolean {
  return !!conversation.pinnedBy?.includes(userId);
}

export function isArchived(conversation: Conversation, userId: string): boolean {
  return !!conversation.archivedBy?.includes(userId);
}

export function isMuted(conversation: Conversation, userId: string): boolean {
  const entry = conversation.mutedBy?.find((m) => m.user === userId);
  if (!entry) return false;
  if (!entry.until) return true;
  return new Date(entry.until).getTime() > Date.now();
}

export function isGroupAdmin(conversation: Conversation, userId: string): boolean {
  return !!conversation.admins?.includes(userId);
}

export function presenceLabel(user: User | undefined): string | null {
  if (!user) return null;
  if (user.isOnline) return 'متصل الآن';
  if (user.lastSeenAt) return `آخر ظهور ${formatDistanceToNowStrict(new Date(user.lastSeenAt), { addSuffix: true, locale: ar })}`;
  return null;
}

export type TickStatus = 'sent' | 'delivered' | 'read';

// Only meaningful for the current user's own messages.
export function tickStatus(message: Message, conversation: Conversation, currentUserId: string): TickStatus {
  const others = otherParticipants(conversation, currentUserId).map((u) => u._id);
  if (others.length === 0) return 'sent';
  const allRead = others.every((id) => message.readBy?.includes(id));
  if (allRead) return 'read';
  const allDelivered = others.every((id) => message.deliveredTo?.includes(id));
  if (allDelivered) return 'delivered';
  return 'sent';
}

const URL_RE = /https?:\/\/[^\s<>()]+/;

// First bare URL in a message's text, if any -- drives the link-preview card under the bubble.
export function extractFirstUrl(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = URL_RE.exec(text);
  if (!match) return null;
  const trailing = match[0].match(/[.,!?;:)\]]+$/)?.[0] ?? '';
  return trailing ? match[0].slice(0, -trailing.length) : match[0];
}

// ---------------------------------------------------------------------------------------------
// Presentation helpers for the chat thread / list.

const ATTACHMENT_PREVIEW: Record<string, string> = {
  image: 'صورة 📷',
  video: 'فيديو 🎥',
  audio: 'ملف صوتي 🎵',
  voice: 'رسالة صوتية 🎤',
  document: 'مستند 📄',
};

// Mirrors the backend's messagePreviewText (chat.constants.ts): text, else poll, else attachment.
export function messagePreview(message: {
  text?: string | null;
  poll?: { question?: string | null } | null;
  attachments?: { type: string }[] | null;
}): string {
  const raw = stripMentionTokens(message.text ?? '');
  // One-line surfaces show the words, not the *markers* (a code block keeps its contents).
  const text = (hasFormatting(raw) ? stripFormatting(raw) : raw).replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 120);
  if (message.poll?.question) return `📊 ${message.poll.question}`;
  const first = message.attachments?.[0];
  return first ? ATTACHMENT_PREVIEW[first.type] ?? 'مرفق' : '';
}

// `@[Name](id)` -> `@Name` for plain-text surfaces (previews, clipboard, exports).
export function stripMentionTokens(text: string): string {
  return text.replace(/@\[([^\]]+)\]\(([0-9a-fA-F]{24})\)/g, '@$1');
}

export function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

// Who sent the conversation's last message, as a list-preview prefix: "أنت" for me, the sender's
// first name in groups, nothing in a DM from the other person.
export function lastSenderPrefix(conversation: Conversation, currentUserId: string): string | null {
  const sender = conversation.lastMessageSender;
  if (!sender) return null;
  const id = typeof sender === 'string' ? sender : sender._id;
  if (id === currentUserId) return 'أنت';
  if (!conversation.isGroup) return null;
  return typeof sender === 'string' ? null : firstName(sender.name) || null;
}

// Latin digits, Arabic day-period ("2:05 م") -- matches the rest of the app's number style.
const clockFormat = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const fullFormat = new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'full', timeStyle: 'short' });
const shortDateFormat = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short' });

export function formatClock(date: string | Date): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : clockFormat.format(d);
}

export function formatFullDate(date: string | Date): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : fullFormat.format(d);
}

// "2:05 م" today, "أمس" yesterday, else "5 أكتوبر".
export function formatListTime(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return clockFormat.format(d);
  if (d.getTime() >= startOfToday - 86_400_000) return 'أمس';
  return shortDateFormat.format(d);
}

// Built from a string (not a literal) so the ES2018-only \p{...} escapes aren't flagged under
// this project's ES2017 target; every browser the app supports handles them at runtime.
const EMOJI_ONLY_RE = new RegExp(
  '^(?:\\p{Extended_Pictographic}|\\p{Emoji_Component}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+$',
  'u',
);

// 1-3 emoji and nothing else -> rendered big with no bubble (WhatsApp/Telegram style).
export function bigEmojiCount(text: string | null | undefined): number {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length > 40 || !EMOJI_ONLY_RE.test(trimmed) || /^[\d#*\s]+$/.test(trimmed)) return 0;
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<unknown> } }).Segmenter;
  const count = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed.replace(/\s+/g, ''))).length
    : Array.from(trimmed.replace(/\s+/g, '')).length;
  return count >= 1 && count <= 3 ? count : 0;
}

// Arabic + Arabic Supplement blocks (U+0600-U+06FF, U+0750-U+077F), built from code points.
const ARABIC_CHAR_RE = new RegExp(
  `[${String.fromCharCode(0x0600)}-${String.fromCharCode(0x06ff)}${String.fromCharCode(0x0750)}-${String.fromCharCode(0x077f)}]`,
  'g',
);
const LATIN_CHAR_RE = /[A-Za-z]/g;

// Translation target for a message: Arabic text -> English, anything else -> Arabic.
export function translationTarget(text: string): 'ar' | 'en' {
  const arabic = text.match(ARABIC_CHAR_RE)?.length ?? 0;
  const latin = text.match(LATIN_CHAR_RE)?.length ?? 0;
  return arabic >= latin ? 'en' : 'ar';
}

export interface FileVisual {
  label: string;
  /** Tailwind classes for the icon tile. */
  tile: string;
}

// A coloured type tile for document cards (PDF red, Word blue, ...).
export function fileVisual(name?: string | null, mimeType?: string | null): FileVisual {
  const ext = (name?.split('.').pop() ?? '').toLowerCase();
  const mime = mimeType ?? '';
  if (ext === 'pdf' || mime.includes('pdf')) return { label: 'PDF', tile: 'bg-rose-500/15 text-rose-500' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mime.includes('word')) return { label: 'DOC', tile: 'bg-sky-500/15 text-sky-500' };
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('sheet') || mime.includes('excel')) {
    return { label: 'XLS', tile: 'bg-emerald-500/15 text-emerald-500' };
  }
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext) || mime.includes('presentation')) {
    return { label: 'PPT', tile: 'bg-orange-500/15 text-orange-500' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip')) return { label: 'ZIP', tile: 'bg-amber-500/15 text-amber-600' };
  if (['txt', 'md', 'json', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css'].includes(ext)) {
    return { label: ext.toUpperCase().slice(0, 4), tile: 'bg-violet-500/15 text-violet-500' };
  }
  return { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', tile: 'bg-accent/15 text-accent' };
}

// "أحمد يكتب…" / "أحمد ومنى يكتبان…" / "3 أشخاص يكتبون…"
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${firstName(names[0]) || 'أحدهم'} يكتب…`;
  if (names.length === 2) return `${firstName(names[0])} و${firstName(names[1])} يكتبان…`;
  return `${names.length} أشخاص يكتبون…`;
}

export function canPinInConversation(conversation: Conversation, userId: string): boolean {
  if (conversation.isGroup && conversation.visibility === 'public') return isGroupAdmin(conversation, userId);
  return true;
}

// Stable per-sender name colour in group chats (Telegram-style), so a busy thread is scannable.
const SENDER_COLORS = [
  'text-rose-500 dark:text-rose-400',
  'text-amber-600 dark:text-amber-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-sky-600 dark:text-sky-400',
  'text-violet-600 dark:text-violet-400',
  'text-pink-600 dark:text-pink-400',
  'text-teal-600 dark:text-teal-400',
  'text-orange-600 dark:text-orange-400',
];

export function senderColor(userId?: string | null): string {
  if (!userId) return 'text-accent';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}
