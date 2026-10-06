'use client';

import { audioContext } from './call-sounds';
import { isMuted } from './chat-helpers';
import type { Conversation } from './types';

// In-app chat sounds, synthesized like the call tones (no audio files):
//   incoming -- a soft rising "bubble" for a message in the conversation you're reading
//   notify   -- a two-note chime for a message in another conversation while the app is open
//   sent     -- a short falling "pop" when your own message goes out
// While the app is in the background the phone's own notification (sw.js) makes the sound
// instead -- see appInForeground(), which mirrors the service worker's check exactly so a
// message never rings twice.

export type ChatSound = 'incoming' | 'notify' | 'sent';

const STORAGE_KEY = 'chat:sounds';
const MIN_GAP_MS: Record<ChatSound, number> = { incoming: 700, notify: 1200, sent: 120 };
const lastPlayed: Partial<Record<ChatSound, number>> = {};

/** Device-level switch (profile > إشعارات الهاتف). On unless turned off. */
export function chatSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setChatSoundsEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}

/** The user is looking at the app right now (not another tab/app, not a locked screen). */
export function appInForeground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
}

// A short note with a fast attack and an exponential tail; `glideTo` bends the pitch.
function pluck(c: AudioContext, freq: number, start: number, duration: number, volume: number, glideTo?: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration * 0.6);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playChatSound(sound: ChatSound, { force = false }: { force?: boolean } = {}): void {
  if (!force && !chatSoundsEnabled()) return;
  const now = Date.now();
  if (!force && now - (lastPlayed[sound] ?? 0) < MIN_GAP_MS[sound]) return; // a burst plays once
  lastPlayed[sound] = now;

  const c = audioContext();
  if (!c) return;
  if (c.state === 'running') render(c, sound);
  // A tap (the settings "try it" button) may land before the unlock's resume() settles.
  else if (force) void c.resume().then(() => render(c, sound)).catch(() => undefined);
  // Otherwise: not unlocked by a tap yet -- the browser wouldn't play it anyway.
}

function render(c: AudioContext, sound: ChatSound) {
  const t = c.currentTime + 0.02;
  if (sound === 'incoming') {
    pluck(c, 640, t, 0.14, 0.09, 960);
  } else if (sound === 'notify') {
    // C6 then G6, each with a quiet octave overtone for a bell-like shimmer.
    pluck(c, 1046.5, t, 0.32, 0.1);
    pluck(c, 2093, t, 0.18, 0.02);
    pluck(c, 1568, t + 0.12, 0.45, 0.1);
    pluck(c, 3136, t + 0.12, 0.22, 0.018);
    try {
      navigator.vibrate?.(35);
    } catch {
      /* needs a prior tap on some browsers */
    }
  } else {
    pluck(c, 900, t, 0.11, 0.055, 430);
  }
}

// --- which conversations are muted (and group names, for the in-app banner) ----------------
// Fed from whichever conversation list is loaded (ChatUnreadProvider's boot fetch, then
// ChatProvider's live list), so the socket listener can decide synchronously.

const meta = new Map<string, { conversation: Conversation }>();
let metaUserId: string | null = null;

export function syncChatAlertConversations(list: Conversation[], userId: string): void {
  meta.clear();
  metaUserId = userId;
  for (const conversation of list) meta.set(conversation._id, { conversation });
}

export function conversationAlertInfo(conversationId: string): { muted: boolean; groupName: string | null } {
  const conversation = meta.get(conversationId)?.conversation;
  if (!conversation || !metaUserId) return { muted: false, groupName: null };
  return {
    muted: isMuted(conversation, metaUserId),
    groupName: conversation.isGroup ? conversation.name ?? null : null,
  };
}
