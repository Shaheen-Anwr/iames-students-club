// Pure helpers for the per-user notification preferences (User.notificationPrefs). Kept out of
// any service so NotificationsService and DigestService share exactly one implementation.

export interface NotificationPrefs {
  mutedTypes: string[];
  quietStart: number | null;
  quietEnd: number | null;
  digestHour: number | null;
}

export const DEFAULT_DIGEST_HOUR = 7;

/** The users' local hour (0-23) right now, given the app-wide UTC offset from config. */
export function localHour(offsetHours: number, now: Date = new Date()): number {
  return (now.getUTCHours() + offsetHours + 24) % 24;
}

/** True when the current local hour falls inside the user's [quietStart, quietEnd) window. */
export function inQuietHours(prefs: NotificationPrefs | null | undefined, offsetHours: number, now: Date = new Date()): boolean {
  const s = prefs?.quietStart;
  const e = prefs?.quietEnd;
  if (s == null || e == null || s === e) return false;
  const h = localHour(offsetHours, now);
  return s < e ? h >= s && h < e : h >= s || h < e; // s<e: normal; s>e: wraps midnight
}

/**
 * Chat pushes are mandatory (product decision, 2026-10-07): the per-type switches and quiet hours
 * never hold back a chat message, a study-group channel message, a thread reply or an @mention
 * inside a chat. The only thing that silences chat is muting a GROUP conversation (ChatService);
 * private chats can't be muted at all.
 */
export function isForcedChatPush(type: string, conversationId?: string | null): boolean {
  return (
    type === 'chat_message' ||
    type === 'channel_message' ||
    type === 'thread_reply' ||
    (type === 'mention' && !!conversationId)
  );
}

/** Should a push for `type` be suppressed for this user right now? (in-app is never suppressed) */
export function pushSuppressed(
  prefs: NotificationPrefs | null | undefined,
  type: string,
  offsetHours: number,
  now: Date = new Date(),
): boolean {
  return !!prefs?.mutedTypes?.includes(type) || inQuietHours(prefs, offsetHours, now);
}
