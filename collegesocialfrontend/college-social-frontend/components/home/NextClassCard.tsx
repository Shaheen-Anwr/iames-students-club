'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarOff, Clock3, MapPin, PartyPopper } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { classPhase, formatMinutes } from '@/lib/today';
import { cn } from '@/lib/utils';
import type { ScheduleEntry } from '@/lib/types';

/** Re-render on an interval so the countdown / progress stay live without a per-second timer. */
function useNowTick(ms = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The one "where am I in my day" card at the top of home: the class running now (with a
 * live progress bar), or the next one today (with a countdown), or a rest state.
 */
export function NextClassCard({ schedule }: { schedule: ScheduleEntry[] }) {
  const now = useNowTick();
  const phase = classPhase(schedule, now);

  if (phase.kind === 'none' || phase.kind === 'done') {
    const done = phase.kind === 'done';
    return (
      <Card className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            done ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success',
          )}
        >
          {done ? <PartyPopper className="h-5 w-5" /> : <CalendarOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{done ? 'انتهت حصص اليوم' : 'لا حصص اليوم'}</p>
          <p className="text-xs text-muted-foreground">
            {done ? 'لا حصص متبقية على جدولك — أحسنت.' : 'استغلّ اليوم للمراجعة أو إنهاء واجب قادم.'}
          </p>
        </div>
      </Card>
    );
  }

  const live = phase.kind === 'in-progress';
  const { entry } = phase;

  return (
    <Card className="relative overflow-hidden p-4">
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              live ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-accent' : 'bg-warning')} />
            {live ? 'المحاضرة الآن' : 'المحاضرة التالية'}
          </span>
          <Link href="/study/schedule" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-accent">
            الجدول الكامل
          </Link>
        </div>

        <p className="mt-2.5 truncate text-lg font-bold tracking-tight text-foreground">{entry.courseName}</p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            <bdi dir="ltr">
              {entry.startTime} – {entry.endTime}
            </bdi>
          </span>
          {entry.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {entry.location}
            </span>
          )}
        </div>

        {live ? (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${phase.progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-medium text-accent">تنتهي بعد {formatMinutes(phase.endsIn)}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-warning">تبدأ بعد {formatMinutes(phase.startsIn)}</p>
        )}
      </div>
    </Card>
  );
}
