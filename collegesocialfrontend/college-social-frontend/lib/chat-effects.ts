'use client';

import type { MessageEffect } from './types';

// Tiny event bus between whoever decides a celebration should play (a message with an `effect`
// arrived, the user sent one, "replay" was tapped) and the single <ChatEffects/> canvas that
// renders it -- no context or refs to thread through the chat tree.

const EVENT = 'chat:effect';
const PLAYED_KEY = 'chatEffectsPlayed';

export const EFFECT_META: Record<MessageEffect, { emoji: string; label: string }> = {
  confetti: { emoji: '🎉', label: 'احتفال' },
  hearts: { emoji: '❤️', label: 'قلوب' },
  fireworks: { emoji: '🎆', label: 'ألعاب نارية' },
  stars: { emoji: '✨', label: 'نجوم' },
};

export const EFFECTS: MessageEffect[] = ['confetti', 'hearts', 'fireworks', 'stars'];

export function playChatEffect(effect: MessageEffect) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MessageEffect>(EVENT, { detail: effect }));
}

export function onChatEffect(handler: (effect: MessageEffect) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<MessageEffect>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// Each message's effect auto-plays once per browser session -- re-opening the chat doesn't
// replay old celebrations (the sparkle button on the bubble still can).
function playedSet(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(PLAYED_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function claimEffectPlay(messageId: string): boolean {
  const played = playedSet();
  if (played.has(messageId)) return false;
  played.add(messageId);
  try {
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...played].slice(-200)));
  } catch {
    /* ignore */
  }
  return true;
}
