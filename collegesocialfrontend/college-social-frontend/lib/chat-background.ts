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
