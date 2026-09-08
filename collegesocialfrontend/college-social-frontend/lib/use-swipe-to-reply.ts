'use client';

import { useRef, useState } from 'react';
import { haptic } from './haptics';

// Touch drag on a message bubble that fires `onReply` once it passes a threshold, WhatsApp-style.
// Returns the live horizontal offset (px) to translate the bubble by, and the touch handlers to
// spread onto it. Vertical-dominant drags are ignored so the thread still scrolls.
export function useSwipeToReply(onReply: () => void, enabled = true) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const THRESHOLD = 56;
  const MAX = 80;

  const reset = () => {
    start.current = null;
    fired.current = false;
    setDx(0);
  };

  const swipeHandlers = enabled
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
          fired.current = false;
        },
        onTouchMove: (e: React.TouchEvent) => {
          if (!start.current) return;
          const t = e.touches[0];
          const dX = t.clientX - start.current.x;
          const dY = t.clientY - start.current.y;
          if (Math.abs(dX) < Math.abs(dY) * 1.2) {
            if (dx !== 0) setDx(0);
            return;
          }
          const clamped = Math.max(-MAX, Math.min(MAX, dX));
          setDx(clamped);
          if (!fired.current && Math.abs(clamped) >= THRESHOLD) {
            fired.current = true;
            haptic('tap');
            onReply();
          }
        },
        onTouchEnd: reset,
        onTouchCancel: reset,
      }
    : {};

  return { dx, swipeHandlers, progress: Math.min(Math.abs(dx) / THRESHOLD, 1) };
}
