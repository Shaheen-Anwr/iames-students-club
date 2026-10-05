import { api, ApiError } from './api';
import type {
  Attachment,
  ChatRewriteMode,
  ChatSummary,
  Message,
  MessageEffect,
  MessageInfo,
  PinnedMessage,
  ScheduledChatMessage,
} from './types';

export const MESSAGE_PAGE_SIZE = 50;

export interface ScheduleMessageInput {
  text?: string;
  attachments?: Attachment[];
  replyTo?: string;
  poll?: { question: string; options: string[]; multiple?: boolean };
  effect?: MessageEffect | null;
  silent?: boolean;
  sendAt: string;
}

// Typed wrappers for the chat REST surface beyond basic history (see ChatController / ChatAiController).
export const chatApi = {
  latest: (conversationId: string) =>
    api.get<Message[]>(`/chat/conversations/${conversationId}/messages?limit=${MESSAGE_PAGE_SIZE}`),

  /** The page strictly older than `beforeId` (newest first). */
  older: (conversationId: string, beforeId: string) =>
    api.get<Message[]>(
      `/chat/conversations/${conversationId}/messages?limit=${MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(beforeId)}`,
    ),

  /** Everything from `since` up to (not including) `beforeId` -- for jumping to an old message. */
  since: (conversationId: string, since: string, beforeId?: string) =>
    api.get<Message[]>(
      `/chat/conversations/${conversationId}/messages?limit=1000&since=${encodeURIComponent(since)}` +
        (beforeId ? `&before=${encodeURIComponent(beforeId)}` : ''),
    ),

  searchIn: (conversationId: string, q: string) =>
    api.get<Message[]>(`/chat/conversations/${conversationId}/search?q=${encodeURIComponent(q)}`),

  searchAll: (q: string) => api.get<Message[]>(`/chat/search?q=${encodeURIComponent(q)}`),

  pins: (conversationId: string) => api.get<PinnedMessage[]>(`/chat/conversations/${conversationId}/pins`),

  messageInfo: (messageId: string) => api.get<MessageInfo>(`/chat/messages/${messageId}/info`),

  scheduled: (conversationId: string) =>
    api.get<ScheduledChatMessage[]>(`/chat/conversations/${conversationId}/scheduled`),
  schedule: (conversationId: string, input: ScheduleMessageInput) =>
    api.post<ScheduledChatMessage>(`/chat/conversations/${conversationId}/scheduled`, input),
  cancelScheduled: (id: string) => api.delete<{ success: true }>(`/chat/scheduled/${id}`),
  sendScheduledNow: (id: string) => api.post<{ success: true }>(`/chat/scheduled/${id}/send-now`),

  markMuted: (conversationId: string, muted: boolean) =>
    muted ? api.post(`/chat/conversations/${conversationId}/mute`, {}) : api.delete(`/chat/conversations/${conversationId}/mute`),

  ai: {
    summary: (conversationId: string, sinceMessageId?: string | null) =>
      api.post<ChatSummary>(
        `/ai/chat/conversations/${conversationId}/summary`,
        sinceMessageId ? { sinceMessageId } : {},
      ),
    replies: (conversationId: string) =>
      api.post<{ replies: string[] }>(`/ai/chat/conversations/${conversationId}/replies`),
    rewrite: (text: string, mode: ChatRewriteMode) => api.post<{ text: string }>('/ai/chat/rewrite', { text, mode }),
    translate: (messageId: string, target: 'ar' | 'en') =>
      api.post<{ text: string; sourceLanguage: string | null }>(`/ai/chat/messages/${messageId}/translate`, { target }),
    transcribe: (messageId: string) =>
      api.post<{ text: string; cached: boolean }>(`/ai/chat/messages/${messageId}/transcribe`),
  },
};

// A user-facing Arabic message for a failed AI call -- the throttler's 429 arrives in English.
export function aiErrorMessage(err: unknown, fallback = 'تعذّر الاتصال بالذكاء الاصطناعي، حاول مجددًا.'): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'طلبات كثيرة خلال دقيقة — انتظر قليلًا ثم أعد المحاولة.';
    if (err.status === 503) return err.message || 'ميزات الذكاء الاصطناعي غير مفعّلة حاليًا.';
    return err.message || fallback;
  }
  return fallback;
}
