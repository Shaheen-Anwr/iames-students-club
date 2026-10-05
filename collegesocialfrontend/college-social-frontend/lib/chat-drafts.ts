'use client';

import { useSyncExternalStore } from 'react';

// Per-conversation unsent drafts (WhatsApp-style): whatever you typed survives switching chats,
// reloads and closing the tab, and the chat list shows "مسودة:" for it. Device-local by design
// (localStorage), shared live between the composer and the list via useSyncExternalStore, and
// kept in sync across tabs through the `storage` event.

const STORAGE_KEY = 'chatDrafts';
const MAX_DRAFTS = 60;

export type ChatDrafts = Record<string, { text: string; at: number }>;

const EMPTY: ChatDrafts = {};
let cache: ChatDrafts | null = null;
const listeners = new Set<() => void>();

function read(): ChatDrafts {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    cache = parsed && typeof parsed === 'object' ? (parsed as ChatDrafts) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function write(next: ChatDrafts) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota -- the in-memory cache still works for this tab */
  }
  emit();
}

export function getDraft(conversationId: string): string {
  return read()[conversationId]?.text ?? '';
}

export function setDraft(conversationId: string, text: string): void {
  if (typeof window === 'undefined') return;
  const current = read();
  if (!text.trim()) {
    if (!(conversationId in current)) return;
    const next = { ...current };
    delete next[conversationId];
    write(next);
    return;
  }
  if (current[conversationId]?.text === text) return;
  const next: ChatDrafts = { ...current, [conversationId]: { text, at: Date.now() } };
  const ids = Object.keys(next);
  if (ids.length > MAX_DRAFTS) {
    ids
      .sort((a, b) => next[a].at - next[b].at)
      .slice(0, ids.length - MAX_DRAFTS)
      .forEach((id) => delete next[id]);
  }
  write(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useChatDrafts(): ChatDrafts {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
