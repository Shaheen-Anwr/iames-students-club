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
};

/** The one-line chat-list preview for a message: its text, else its poll, else its attachment. */
export function messagePreviewText(message: {
  text?: string | null;
  poll?: { question?: string | null } | null;
  attachments?: { type?: string | null }[] | null;
  call?: { type?: string | null; outcome?: string | null } | null;
}): string {
  if (message.call) {
    const kind = message.call.type === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية';
    const missed = message.call.outcome && isMissedCallOutcome(message.call.outcome as CallOutcome);
    return `${message.call.type === 'video' ? '🎥' : '📞'} ${kind}${missed ? ' فائتة' : ''}`;
  }
  const text = message.text?.trim();
  if (text) return text.slice(0, 120);
  if (message.poll?.question) return `📊 ${message.poll.question}`.slice(0, 120);
  const first = message.attachments?.[0];
  if (!first) return '';
  return ATTACHMENT_PREVIEW_LABELS[first.type ?? ''] ?? 'أرسل مرفقًا';
}

/** Escapes user input for use inside a RegExp / Mongo $regex -- search is plain substring match. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
