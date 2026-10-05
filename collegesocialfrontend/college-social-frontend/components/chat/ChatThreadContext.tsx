'use client';

import { createContext, useContext } from 'react';
import type { Message, User } from '@/lib/types';

// Everything a message bubble can ask the thread to do. ChatWindow provides ONE object whose
// identity never changes (each method forwards to the latest handler via a ref), so the memoized
// bubbles never re-render just because a callback was re-created.
export interface ChatThreadActions {
  reply: (message: Message) => void;
  react: (message: Message, emoji: string) => void;
  openActions: (message: Message, anchor: HTMLElement) => void;
  toggleSelect: (message: Message) => void;
  jumpTo: (messageId: string, createdAt?: string) => void;
  retry: (message: Message) => void;
  openImage: (message: Message, imageIndex: number) => void;
  vote: (message: Message, optionIds: string[]) => void;
  closePoll: (message: Message) => void;
  showReactions: (message: Message) => void;
  showPollVotes: (message: Message) => void;
  replayEffect: (message: Message) => void;
  hideTranslation: (messageId: string) => void;
  /** Call the other person in this (1-to-1) conversation -- from a call-log bubble. */
  call: (type: 'audio' | 'video') => void;
  /** Open the side discussion hanging off a message (group chats). */
  openThread: (message: Message) => void;
}

// Slower-changing thread facts (participants churn on every presence ping). Read only by the
// few small leaf components that need names/photos (avatars, read heads, reaction tooltips).
export interface ChatThreadInfo {
  currentUserId: string;
  isGroup: boolean;
  participantsById: Map<string, User>;
}

export const ChatThreadActionsContext = createContext<ChatThreadActions | null>(null);
export const ChatThreadInfoContext = createContext<ChatThreadInfo | null>(null);

export function useChatActions(): ChatThreadActions {
  const ctx = useContext(ChatThreadActionsContext);
  if (!ctx) throw new Error('useChatActions must be used inside a chat thread');
  return ctx;
}

export function useChatInfo(): ChatThreadInfo {
  const ctx = useContext(ChatThreadInfoContext);
  if (!ctx) throw new Error('useChatInfo must be used inside a chat thread');
  return ctx;
}
