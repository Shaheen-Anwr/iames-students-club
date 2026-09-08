'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ChatBackground {
  type: 'preset' | 'custom';
  value: string;
}

export interface ChatBackgroundPreset {
  id: string;
  label: string;
  // CSS `background` shorthand -- these are drawn with gradients/patterns so the feature
  // doesn't depend on shipping actual image assets.
  css: string;
}

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  {
    id: 'notebook',
    label: 'دفتر ملاحظات',
    css: 'repeating-linear-gradient(180deg, #fdfaf3 0px, #fdfaf3 27px, #cfe0f0 28px, #fdfaf3 29px), linear-gradient(90deg, transparent 48px, #f2b8c6 48px, #f2b8c6 50px, transparent 50px)',
  },
  {
    id: 'chalkboard',
    label: 'سبورة',
    css: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.05) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.04) 0, transparent 45%), linear-gradient(160deg, #1f3d2e, #16281f)',
  },
  {
    id: 'library',
    label: 'مكتبة',
    css: 'linear-gradient(180deg, rgba(120,84,54,0.12), rgba(120,84,54,0.02)), repeating-linear-gradient(90deg, #efe3d0 0px, #efe3d0 38px, #e6d5b8 39px, #efe3d0 40px)',
  },
  {
    id: 'focus',
    label: 'تركيز هادئ',
    css: 'linear-gradient(135deg, #dfeeff, #f4f1ff)',
  },
  {
    id: 'night',
    label: 'مذاكرة ليلية',
    css: 'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.08) 0, transparent 2%), radial-gradient(circle at 65% 60%, rgba(255,255,255,0.06) 0, transparent 1.5%), radial-gradient(circle at 85% 15%, rgba(255,255,255,0.07) 0, transparent 1.5%), linear-gradient(160deg, #0f1a2e, #1a2540)',
  },
  {
    id: 'graph',
    label: 'ورق مربعات',
    css: 'linear-gradient(#e7edf5 1px, transparent 1px), linear-gradient(90deg, #e7edf5 1px, transparent 1px), #fbfcfe',
  },
];

// --- per-chat accent -------------------------------------------------------------------------
// A conversation can override the app accent (own bubbles, send button, pills, links). Values are
// "r g b" triples so they slot straight into the --accent* CSS custom properties Tailwind reads.
export interface ChatAccent {
  id: string;
  label: string;
  accent: string; // --accent
  from: string; // --accent-grad-from
  to: string; // --accent-grad-to
}

export const CHAT_ACCENTS: ChatAccent[] = [
  { id: 'teal', label: 'فيروزي', accent: '13 148 136', from: '20 184 166', to: '13 148 136' },
  { id: 'rose', label: 'وردي', accent: '225 29 72', from: '244 63 94', to: '190 18 60' },
  { id: 'amber', label: 'عنبري', accent: '217 119 6', from: '245 158 11', to: '180 83 9' },
  { id: 'violet', label: 'بنفسجي', accent: '124 58 237', from: '139 92 246', to: '109 40 217' },
  { id: 'emerald', label: 'أخضر', accent: '5 150 105', from: '16 185 129', to: '4 120 87' },
  { id: 'graphite', label: 'رمادي', accent: '71 85 105', from: '100 116 139', to: '51 65 85' },
];

export function chatAccentVars(id: string | null): React.CSSProperties {
  const a = id ? CHAT_ACCENTS.find((x) => x.id === id) : null;
  if (!a) return {};
  return {
    '--accent': a.accent,
    '--accent-grad-from': a.from,
    '--accent-grad-to': a.to,
  } as React.CSSProperties;
}

const ACCENT_KEY = 'chatAccents';

export function useChatAccent(conversationId: string) {
  const [accent, setAccentState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACCENT_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      setAccentState(map[conversationId] ?? null);
    } catch {
      setAccentState(null);
    }
  }, [conversationId]);

  const setAccent = useCallback(
    (id: string | null) => {
      try {
        const raw = localStorage.getItem(ACCENT_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        if (id) map[conversationId] = id;
        else delete map[conversationId];
        localStorage.setItem(ACCENT_KEY, JSON.stringify(map));
      } catch {
        /* private mode */
      }
      setAccentState(id);
    },
    [conversationId],
  );

  return { accent, setAccent };
}

const STORAGE_KEY = 'chatBackgrounds';

function readAll(): Record<string, ChatBackground> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ChatBackground>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ChatBackground>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function chatBackgroundStyle(bg: ChatBackground | null): React.CSSProperties {
  if (!bg) return {};
  if (bg.type === 'preset') {
    const preset = CHAT_BACKGROUND_PRESETS.find((p) => p.id === bg.value);
    return preset ? { background: preset.css, backgroundSize: bg.value === 'graph' ? '24px 24px' : undefined } : {};
  }
  return { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover', backgroundPosition: 'center' };
}

// Per-conversation chat wallpaper, persisted client-side (mirrors the localStorage pattern used
// by theme-context.tsx). Purely a per-device preference -- there's no backend "chat settings"
// model to hang this on yet.
export function useChatBackground(conversationId: string) {
  const [background, setBackgroundState] = useState<ChatBackground | null>(null);

  useEffect(() => {
    setBackgroundState(readAll()[conversationId] ?? null);
  }, [conversationId]);

  const setBackground = useCallback(
    (bg: ChatBackground | null) => {
      const all = readAll();
      if (bg) all[conversationId] = bg;
      else delete all[conversationId];
      writeAll(all);
      setBackgroundState(bg);
    },
    [conversationId],
  );

  return { background, setBackground };
}
