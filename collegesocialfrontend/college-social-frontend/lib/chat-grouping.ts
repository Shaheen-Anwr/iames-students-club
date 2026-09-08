// Turns a flat, chronological Message[] into the rows the chat renders: day dividers, an
// "unread from here" divider, and messages annotated with how they cluster. A cluster = the same
// sender, no day boundary, and gaps under GROUP_WINDOW_MS. The last bubble in a cluster carries
// the avatar + timestamp + ticks; the first carries the sender name (group chats only).

import { differenceInCalendarDays, format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Message } from './types';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface GroupFlags {
  firstInGroup: boolean;
  lastInGroup: boolean;
  /** Show the sender's name above the bubble (group chats, first bubble of a cluster). */
  showName: boolean;
}

export type ChatRow =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'unread'; id: string }
  | { kind: 'msg'; id: string; message: Message; flags: GroupFlags };

export function dayLabel(d: Date): string {
  if (isToday(d)) return 'اليوم';
  if (isYesterday(d)) return 'أمس';
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, 'EEEE', { locale: ar });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'd MMMM' : 'd MMMM yyyy', { locale: ar });
}

function ts(m: Message): number {
  const t = new Date(m.createdAt).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * @param messages       chronological (oldest first), already filtered for display
 * @param currentUserId
 * @param isGroup        show sender names
 * @param firstUnreadId  message id to drop the "unread" divider before, or null
 */
export function buildChatRows(
  messages: Message[],
  currentUserId: string,
  isGroup: boolean,
  firstUnreadId: string | null,
): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDayKey = '';

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const d = new Date(ts(m));

    const dayKey = d.toDateString();
    const newDay = dayKey !== lastDayKey;
    if (newDay) {
      rows.push({ kind: 'day', id: `day-${dayKey}`, label: dayLabel(d) });
      lastDayKey = dayKey;
    }

    if (firstUnreadId && m._id === firstUnreadId) {
      rows.push({ kind: 'unread', id: 'unread-divider' });
    }

    const sameSenderAsPrev =
      !newDay && !!prev && prev.sender?._id === m.sender?._id && ts(m) - ts(prev) < GROUP_WINDOW_MS;
    const sameSenderAsNext =
      !!next &&
      next.sender?._id === m.sender?._id &&
      new Date(ts(next)).toDateString() === dayKey &&
      ts(next) - ts(m) < GROUP_WINDOW_MS &&
      next._id !== firstUnreadId; // an unread divider breaks the visual cluster

    const firstInGroup = !sameSenderAsPrev;
    const lastInGroup = !sameSenderAsNext;

    rows.push({
      kind: 'msg',
      id: m._id,
      message: m,
      flags: {
        firstInGroup,
        lastInGroup,
        showName: isGroup && firstInGroup && m.sender?._id !== currentUserId,
      },
    });
  }

  return rows;
}
