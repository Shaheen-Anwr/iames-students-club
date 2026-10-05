'use client';

import { useCallback, useEffect, useRef } from 'react';
import { haptic } from './haptics';

interface LongPressOptions {
  /** Hold time before firing, ms. */
  delay?: number;
  /** Finger travel (px) that cancels the press -- a scroll or swipe isn't a long-press. */
  moveTolerance?: number;
  disabled?: boolean;
}

// Touch long-press + desktop right-click on one element, both resolving to `onLongPress(el)`.
// Mouse presses are ignored (desktop uses hover toolbars / right-click instead), so this never
// fights text selection with a mouse. `consumeLongPress()` lets the element's onClick tell a
// press-and-release that already opened something apart from a genuine tap.
export function useLongPress<T extends HTMLElement>(
  onLongPress: (el: T, point: { x: number; y: number }) => void,
  { delay = 380, moveTolerance = 10, disabled = false }: LongPressOptions = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const lastFiredAt = useRef(0);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const fire = useCallback((el: T, point: { x: number; y: number }) => {
    // Android Chrome raises `contextmenu` for the same hold our timer already handled.
    if (Date.now() - lastFiredAt.current < 700) return;
    lastFiredAt.current = Date.now();
    fired.current = true;
    haptic('impact');
    callback.current(el, point);
  }, []);

  const handlers = disabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent<T>) => {
          if (e.pointerType === 'mouse') return;
          fired.current = false;
          origin.current = { x: e.clientX, y: e.clientY };
          const el = e.currentTarget;
          const point = { x: e.clientX, y: e.clientY };
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            fire(el, point);
          }, delay);
        },
        onPointerMove: (e: React.PointerEvent<T>) => {
          if (!origin.current) return;
          if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > moveTolerance) cancel();
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onPointerLeave: cancel,
        onContextMenu: (e: React.MouseEvent<T>) => {
          e.preventDefault();
          cancel();
          fire(e.currentTarget, { x: e.clientX, y: e.clientY });
        },
      };

  // True (once) if the press that just ended was a long-press -- call from onClick to swallow it.
  const consumeLongPress = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { handlers, consumeLongPress };
}
