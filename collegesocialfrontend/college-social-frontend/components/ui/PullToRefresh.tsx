'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const THRESHOLD = 68; // px pull past which releasing triggers a refresh
const MAX_PULL = 108; // px the content can travel (heavily damped past THRESHOLD)

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | unknown;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Turns its own element into the scroll container and adds a native-feeling pull-to-refresh at
 * the top edge. Touch only -- on pointer/desktop it's just a scroll box. The indicator rotates
 * in with the pull and spins while `onRefresh()` is in flight. prefers-reduced-motion is
 * handled by the global CSS kill-switch (the transform still tracks the finger; the settle
 * transition just becomes instant).
 */
export function PullToRefresh({ onRefresh, className, disabled, children }: PullToRefreshProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const draggingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(true);

  const setPullBoth = useCallback((v: number) => {
    pullRef.current = v;
    setPull(v);
  }, []);

  const run = useCallback(async () => {
    setRefreshing(true);
    setSettling(true);
    setPullBoth(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPullBoth(0);
    }
  }, [onRefresh, setPullBoth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || el.scrollTop > 0 || e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      draggingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || el.scrollTop > 0) {
        if (!draggingRef.current) startY.current = null;
        return;
      }
      draggingRef.current = true;
      setSettling(false);
      const eased = delta <= THRESHOLD ? delta : THRESHOLD + (delta - THRESHOLD) * 0.35;
      setPullBoth(Math.min(eased, MAX_PULL));
      if (e.cancelable) e.preventDefault(); // keep the page still while pulling
    };

    const onTouchEnd = () => {
      if (startY.current == null) {
        draggingRef.current = false;
        return;
      }
      const shouldRefresh = draggingRef.current && pullRef.current >= THRESHOLD;
      startY.current = null;
      draggingRef.current = false;
      setSettling(true);
      if (shouldRefresh) void run();
      else setPullBoth(0);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, refreshing, run, setPullBoth]);

  const progress = Math.min(pull / THRESHOLD, 1);
  const active = pull > 0 || refreshing;
  const settleTransition = settling ? 'transform 260ms var(--ease-emphasized)' : 'none';

  return (
    <div ref={scrollRef} className={cn('relative overflow-y-auto overflow-x-hidden', className)}>
      <div
        aria-hidden={!active}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{ transform: `translateY(${active ? Math.max(pull - 6, 0) : -44}px)`, transition: settleTransition }}
      >
        <span
          className={cn(
            'mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-surface text-muted-foreground shadow-elev-2',
            (progress >= 1 || refreshing) && 'border-accent/40 text-accent',
          )}
        >
          <Loader2
            className={cn('h-4 w-4', refreshing && 'animate-spin')}
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.35 + progress * 0.65 }}
          />
        </span>
      </div>
      <div style={{ transform: `translateY(${active ? pull : 0}px)`, transition: settleTransition }}>{children}</div>
    </div>
  );
}
