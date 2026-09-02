'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Eases a number from 0 → `target` once on mount (and again whenever `target` changes), so a KPI
 * tile ticks up instead of snapping. rAF-driven, ~700ms, ease-out cubic. Respects reduced motion
 * (jumps straight to the value). Returns the current animated value — format it at the call site.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target)) {
      setValue(target);
      return;
    }

    const from = fromRef.current;
    startRef.current = 0;
    let raf = 0;

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
