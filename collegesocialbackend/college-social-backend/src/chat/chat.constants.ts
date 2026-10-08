// Shared limits + small pure helpers for the chat module's richer message types (polls, send
// effects, pinned messages, scheduled sends). Kept free of Nest/Mongoose imports so the DTOs,
// schemas, services and unit tests can all share one source of truth.

// Full-screen celebrations a sender can attach to a message ("send with effect"). The client plays
// the matching particle animation once, on arrival / first view.
export const MESSAGE_EFFECTS = ['confetti', 'hearts', 'fireworks', 'stars'] as const;
export type MessageEffect = (typeof MESSAGE_EFFECTS)[number];

export function isMessageEffect(value: unknown): value is MessageEffect {
  return typeof value === 'string' && (MESSAGE_EFFECTS as readonly string[]).includes(value);
}

export const POLL_LIMITS = {
  minOptions: 2,
  maxOptions: 12,
  questionMax: 300,
  optionMax: 120,
} as const;

// WhatsApp-style cap: pinning one more message past this drops the oldest pin.
export const MAX_PINNED_MESSAGES = 3;

export const SCHEDULE_LIMITS = {
  // A "scheduled" send must be at least this far out -- anything sooner is just a send.
  minLeadMs: 10_000,
  maxLeadMs: 365 * 24 * 60 * 60 * 1000,
  // Pending scheduled messages per sender, across all conversations.
  maxPendingPerUser: 100,
} as const;

// Forwarding several selected messages at once -- bounds one request's fan-out.
export const FORWARD_LIMITS = { maxMessages: 30, maxConversations: 10 } as const;

// How a call ended, as logged into the chat by the caller's client (see ChatCallService.logCall).
//   completed -- connected, then hung up (has a duration)
//   no_answer -- rang out unanswered       canceled -- caller hung up before an answer
//   declined  -- callee rejected it         busy     -- callee was already on a call
//   failed    -- media never connected / dropped and couldn't recover
export const CALL_OUTCOMES = ['completed', 'no_answer', 'canceled', 'declined', 'busy', 'failed'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export type CallKind = 'audio' | 'video';

export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === 'string' && (CALL_OUTCOMES as readonly string[]).includes(value);
}

/** Outcomes the callee experiences as a missed call (worth a notification). */
export function isMissedCallOutcome(outcome: CallOutcome): boolean {
  return outcome === 'no_answer' || outcome === 'canceled' || outcome === 'busy';
}

// A client-generated call id: UUID-ish, so relays can be matched to one call without server state.
export function isCallId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

export interface NormalizedPollInput {
  question: string;
  options: string[];
  multiple: boolean;
}

/**
 * Trims and validates a client-supplied poll. Returns null when the input isn't a usable poll
 * (missing question, fewer than two distinct non-empty options) so callers can reject it with
 * their own error; over-long text is clipped rather than rejected, and duplicate options
 * (case-insensitive) collapse into one.
 */
export function normalizePollInput(raw: unknown): NormalizedPollInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as { question?: unknown; options?: unknown; multiple?: unknown };
  const question = typeof input.question === 'string' ? input.question.trim().slice(0, POLL_LIMITS.questionMax) : '';
  if (!question) return null;
  if (!Array.isArray(input.options)) return null;

  const seen = new Set<string>();
  const options: string[] = [];
  for (const option of input.options) {
    if (typeof option !== 'string') continue;
    const text = option.trim().slice(0, POLL_LIMITS.optionMax);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    options.push(text);
    if (options.length === POLL_LIMITS.maxOptions) break;
  }
  if (options.length < POLL_LIMITS.minOptions) return null;
  return { question, options, multiple: input.multiple === true };
}

const ATTACHMENT_PREVIEW_LABELS: Record<string, string> = {
  image: 'صورة 📷',
  video: 'فيديو 🎥',
  audio: 'ملف صوتي 🎵',
  voice: 'رسالة صوتية 🎤',
  document: 'مستند 📄',
  sticker: 'ملصق ✨',
};

// --- Bot / system messages -------------------------------------------------------------------
// A message with `bot` set has no human sender: «رافد» (the AI assistant, answering an @mention
// or posting the daily question) or the platform itself (class-group posts: new lecture,
// announcement). Bot messages never trigger notifications.
export const CHAT_BOTS = ['rafed', 'system'] as const;
export type ChatBot = (typeof CHAT_BOTS)[number];

// How the client encodes an @mention of رافد in message text -- same `@[name](id)` shape as a user
// mention, but the id is the literal "rafed", which the 24-hex user-mention parser never matches.
export const RAFED_MENTION_TOKEN = '@[رافد](rafed)';

/** True when a message is addressed to رافد: the mention token, or a typed "@رافد". */
export function mentionsRafed(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.includes(RAFED_MENTION_TOKEN) || /(^|\s)@رافد(?=$|[\s،,.!?؟:])/u.test(text);
}

/** The question with the mention removed -- what رافد is actually being asked. */
export function stripRafedMention(text: string): string {
  return text.split(RAFED_MENTION_TOKEN).join(' ').replace(/(^|\s)@رافد(?=$|[\s،,.!?؟:])/gu, ' ').replace(/\s+/g, ' ').trim();
}

// --- Cards: a platform item shared into a chat (lecture/post, assignment, event, listing) ------
export const CARD_KINDS = ['post', 'assignment', 'event', 'listing', 'status', 'announcement'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export function isCardKind(value: unknown): value is CardKind {
  return typeof value === 'string' && (CARD_KINDS as readonly string[]).includes(value);
}

const CARD_PREVIEW_ICONS: Record<CardKind, string> = {
  post: '📌',
  assignment: '📝',
  event: '📅',
  listing: '🛍️',
  status: '🟢',
  announcement: '📢',
};

/** The one-line chat-list preview for a message: its text, else its poll, else its attachment. */
export function messagePreviewText(message: {
  text?: string | null;
  poll?: { question?: string | null } | null;
  attachments?: { type?: string | null }[] | null;
  call?: { type?: string | null; outcome?: string | null } | null;
  card?: { kind?: string | null; title?: string | null; meta?: Record<string, unknown> | null } | null;
}): string {
  if (message.call) {
    const kind = message.call.type === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية';
    const missed = message.call.outcome && isMissedCallOutcome(message.call.outcome as CallOutcome);
    return `${message.call.type === 'video' ? '🎥' : '📞'} ${kind}${missed ? ' فائتة' : ''}`;
  }
  const text = message.text?.trim();
  // A reply / quick reaction to a story (the card is the story). Worded for both sides of the chat.
  if (message.card?.kind === 'status' && text) {
    return (message.card.meta?.reaction ? `${text} تفاعل مع الحالة` : `↩️ ردّ على الحالة: ${stripRafedTokens(text)}`).slice(0, 120);
  }
  if (text) return stripRafedTokens(text).slice(0, 120);
  if (message.card?.title) {
    const icon = isCardKind(message.card.kind) ? CARD_PREVIEW_ICONS[message.card.kind] : '📌';
    return `${icon} ${message.card.title}`.slice(0, 120);
  }
  if (message.poll?.question) return `📊 ${message.poll.question}`.slice(0, 120);
  const first = message.attachments?.[0];
  if (!first) return '';
  return ATTACHMENT_PREVIEW_LABELS[first.type ?? ''] ?? 'أرسل مرفقًا';
}

// The list preview shows "@رافد" rather than the raw token.
function stripRafedTokens(text: string): string {
  return text.split(RAFED_MENTION_TOKEN).join('@رافد');
}

// --- Class groups: one auto-joined group chat per شعبة + academic year ------------------------
const DEPARTMENT_LABELS: Record<string, string> = {
  business_administration: 'شعبة إدارة الأعمال',
  media_science: 'شعبة علوم الإعلام',
  engineering: 'شعبة هندسة',
};

const YEAR_LABELS: Record<string, string> = {
  year1: 'السنة الأولى',
  year2: 'السنة الثانية',
  year3: 'السنة الثالثة',
  year4: 'السنة الرابعة',
  year5: 'السنة الخامسة',
};

export function classKeyFor(department: string | null | undefined, academicYear: string | null | undefined): string | null {
  if (!department || !academicYear || !DEPARTMENT_LABELS[department] || !YEAR_LABELS[academicYear]) return null;
  return `${department}:${academicYear}`;
}

export function parseClassKey(key: string): { department: string; academicYear: string } | null {
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const [department, academicYear] = parts;
  return classKeyFor(department, academicYear) ? { department, academicYear } : null;
}

/** "دفعة السنة الثالثة · شعبة هندسة" */
export function classGroupName(department: string, academicYear: string): string {
  return `دفعة ${YEAR_LABELS[academicYear] ?? academicYear} · ${DEPARTMENT_LABELS[department] ?? department}`;
}

// --- Days in the app's timezone (streaks, daily question, evening digest) --------------------
// The platform's students are all in one timezone; a fixed offset keeps "today" stable without a
// tz database (same convention as the digest's appTzOffsetHours, default +3).
export function localDayKey(date: Date, tzOffsetHours = 3): string {
  return new Date(date.getTime() + tzOffsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** The day before a YYYY-MM-DD key. */
export function previousDayKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Advances a two-person "chat streak" for a message sent on `today` by `senderId`. A day counts
 * once BOTH people sent at least one message that day; consecutive counted days grow the streak,
 * a missed day restarts it at 1. Pure -- returns the new state (or null when nothing changed).
 */
export function advanceStreak(
  state: { count: number; day: string | null; lastSent: Record<string, string> },
  senderId: string,
  otherId: string,
  today: string,
): { count: number; day: string | null; lastSent: Record<string, string> } | null {
  if (state.lastSent[senderId] === today && state.day === today) return null;
  const lastSent = { ...state.lastSent, [senderId]: today };
  if (lastSent[otherId] !== today || state.day === today) {
    return state.lastSent[senderId] === today ? null : { ...state, lastSent };
  }
  const count = state.day === previousDayKey(today) ? state.count + 1 : 1;
  return { count, day: today, lastSent };
}

/** Escapes user input for use inside a RegExp / Mongo $regex -- search is plain substring match. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
