'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

const THRESHOLD = 72; // px of pull (after resistance) to trigger a refresh
const MAX_PULL = 110; // clamp for the indicator height
const RESISTANCE = 0.5; // drag feels heavier than 1:1

/**
 * Touch pull-to-refresh for a scroll container. Arms only when the container is already at the
 * top and the finger moves down, and re-checks scrollTop mid-gesture so a normal scroll never
 * gets hijacked. Desktop is untouched (touch events only).
 *
 * `onRefresh` is read through a ref, so it needn't be memoised by the caller.
 */
export function usePullToRefresh<T extends HTMLElement>(
  scrollRef: RefObject<T | null>,
  onRefresh: () => unknown | Promise<unknown>,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const s = { startY: null as number | null, armed: false, pull: 0, busy: false };
    const set = (p: number) => {
      s.pull = p;
      setPull(p);
    };

    const onStart = (e: TouchEvent) => {
      if (s.busy) return;
      s.startY = e.touches[0].clientY;
      s.armed = el.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (s.startY == null || !s.armed || s.busy) return;
      const dy = e.touches[0].clientY - s.startY;
      if (dy <= 0 || el.scrollTop > 0) {
        if (s.pull !== 0) set(0);
        if (el.scrollTop > 0) s.armed = false;
        return;
      }
      if (e.cancelable) e.preventDefault(); // own the gesture; suppress native rubber-band
      set(Math.min(dy * RESISTANCE, MAX_PULL));
    };
    const onEnd = () => {
      if (s.startY == null) return;
      const trigger = s.pull >= THRESHOLD && !s.busy;
      s.startY = null;
      s.armed = false;
      if (!trigger) {
        set(0);
        return;
      }
      s.busy = true;
      setRefreshing(true);
      set(THRESHOLD);
      Promise.resolve(onRefreshRef.current()).finally(() => {
        s.busy = false;
        setRefreshing(false);
        set(0);
      });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef]);

  return { pull, refreshing, threshold: THRESHOLD };
}
