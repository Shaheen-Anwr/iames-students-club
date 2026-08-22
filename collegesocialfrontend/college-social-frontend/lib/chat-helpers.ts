import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
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
