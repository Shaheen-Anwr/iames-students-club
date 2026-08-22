'use client';

import { useEffect, useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const MILESTONES = [7, 30, 100];

// Client-side-only: pulses the flame once per session when the signed-in user's streak count
// crosses a milestone since the last time this pill rendered for them (persisted in
// localStorage). No backend event exists for "streak milestone reached", so this is detected on
// the next render/refresh, not instantly.
function useMilestonePulse(userId?: string, streak?: number) {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!userId || streak === undefined || typeof window === 'undefined') return;
    const key = `seen-streak:${userId}`;
    const previous = Number(window.localStorage.getItem(key) ?? '0');
    window.localStorage.setItem(key, String(streak));

    if (streak > previous && MILESTONES.includes(streak)) {
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), 3500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, streak]);

  return pulsing;
}

export function StreakPointsPill({
  className,
  user: userProp,
  size = 'sm',
}: {
  className?: string;
  /** Stats to display; defaults to the signed-in user (navbar usage). Pass the viewed profile's user to show their stats instead. */
  user?: User;
  size?: 'sm' | 'lg';
}) {
  const { user: authUser } = useAuth();
  const user = userProp ?? authUser;
  const pulsing = useMilestonePulse(user?._id, user?.streakCount ?? 0);
  if (!user) return null;

  const streak = user.streakCount ?? 0;
  const points = user.points ?? 0;

  if (size === 'lg') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div
          className={cn(
            'flex flex-1 items-center gap-3 rounded-2xl border border-border bg-surface-2/70 px-4 py-3 transition-shadow',
            streak > 0 && 'border-warning/30 shadow-[0_0_20px_-8px_rgb(var(--warning)/0.5)]',
          )}
        >
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning', pulsing && 'animate-pulse-glow')}>
            <Flame className="h-5 w-5 fill-warning/30" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-foreground">{streak}</p>
            <p className="text-xs text-muted-foreground">يوم متتالي</p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-surface-2/70 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-foreground">{points}</p>
            <p className="text-xs text-muted-foreground">نقطة</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold', className)}>
      <span className={cn('flex items-center gap-1 rounded-full text-warning', pulsing && 'animate-pulse-glow')} title="أيام متتالية">
        <Flame className="h-3.5 w-3.5 fill-warning/30" />
        {streak}
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="flex items-center gap-1 text-accent" title="النقاط">
        <Sparkles className="h-3.5 w-3.5" />
        {points}
      </span>
    </div>
  );
}
