'use client';

import { useSyncExternalStore } from 'react';

// In-app chat heads (Messenger-style bubbles). The socket listener (ChatAlertsHost) adds to this
// tiny store; the bubble UI (ChatHeads) renders it. Kept in sessionStorage so the bubbles survive
// page changes and reloads for the rest of the session -- and only for this tab/session, so a
// shared device doesn't keep someone else's chats floating around.

export interface ChatHead {
  conversationId: string;
  /** Sender (private chat) or group name. */
  name: string;
  photoUrl: string | null;
  isGroup: boolean;
  unread: number;
  /** Newest line for the peek bubble ("Name: text" in groups). */
  preview: string;
  /** When it last changed -- also what triggers the peek bubble. */
  at: number;
}

interface State {
  heads: ChatHead[];
  /** The conversation open in the expanded bubble, if any (its messages don't count as unread). */
  openId: string | null;
}

const STORAGE_KEY = 'chat:heads';
const MAX_HEADS = 4;
const EMPTY: State = { heads: [], openId: null };

function load(): State {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const heads = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as ChatHead[];
    return { heads: Array.isArray(heads) ? heads.slice(0, MAX_HEADS) : [], openId: null };
  } catch {
    return EMPTY;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.heads));
  } catch {
    /* private mode */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatHeads(): State {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** A new message in `conversationId`: bring its bubble to the front (creating it), +1 unread. */
export function upsertChatHead(input: Omit<ChatHead, 'unread' | 'at'>): void {
  const existing = state.heads.find((h) => h.conversationId === input.conversationId);
  const isOpen = state.openId === input.conversationId;
  const head: ChatHead = {
    ...input,
    unread: isOpen ? 0 : (existing?.unread ?? 0) + 1,
    at: Date.now(),
  };
  const others = state.heads.filter((h) => h.conversationId !== input.conversationId);
  set({ ...state, heads: [head, ...others].slice(0, MAX_HEADS) });
}

export function removeChatHead(conversationId: string): void {
  if (!state.heads.some((h) => h.conversationId === conversationId)) return;
  set({
    heads: state.heads.filter((h) => h.conversationId !== conversationId),
    openId: state.openId === conversationId ? null : state.openId,
  });
}

export function clearChatHeads(): void {
  set({ heads: [], openId: null });
}

export function openChatHead(conversationId: string | null): void {
  set({
    openId: conversationId,
    heads: state.heads.map((h) => (h.conversationId === conversationId ? { ...h, unread: 0 } : h)),
  });
}

export function openChatHeadId(): string | null {
  return state.openId;
}
