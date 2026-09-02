'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, MoveUpRight } from 'lucide-react';
import type { DailyCount } from '@/lib/types';
import { cn } from '@/lib/utils';
import { compact, deltaLabel, nf, type Delta } from '@/lib/format';
import { useCountUp } from './useCountUp';
import { SparkArea } from './SparkArea';

type Tone = 'accent' | 'warning' | 'success' | 'danger' | 'gold' | 'neutral';

const TONE_CHIP: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  gold: 'bg-gold/15 text-gold',
  neutral: 'bg-surface-3 text-muted-foreground',
};

const TONE_SPARK: Record<Tone, string> = {
  accent: 'rgb(var(--accent))',
  warning: 'rgb(var(--warning))',
  success: 'rgb(var(--success))',
  danger: 'rgb(var(--danger))',
  gold: 'rgb(var(--gold))',
  neutral: 'rgb(var(--muted-foreground))',
};

interface StatCardProps {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  /** Period-over-period change — renders the ▲/▼ pill. */
  delta?: Delta;
  /** When the delta direction is good news even though it's "down" (e.g. overdue items). */
  invertDelta?: boolean;
  /** Daily series — renders an inline sparkline under the value. */
  series?: DailyCount[];
  /** Turns the whole card into a drill-in link. */
  href?: string;
  /** Show the exact grouped number instead of the compact form. */
  exact?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'accent',
  delta,
  invertDelta,
  series,
  href,
  exact,
  className,
}: StatCardProps) {
  const animated = useCountUp(value);
  const shown = exact ? nf(animated) : compact(animated);

  const goodUp = !invertDelta;
  const deltaGood = delta?.dir === 'flat' ? null : delta ? (delta.dir === 'up') === goodUp : null;
  const DeltaIcon = delta?.dir === 'up' ? ArrowUpRight : delta?.dir === 'down' ? ArrowDownRight : Minus;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_CHIP[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
              deltaGood == null
                ? 'bg-surface-3 text-muted-foreground'
                : deltaGood
                  ? 'bg-success/12 text-success'
                  : 'bg-danger/12 text-danger',
            )}
            title="مقارنةً بالفترة السابقة"
          >
            <DeltaIcon className="h-3 w-3" />
            {deltaLabel(delta)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{shown}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-muted-foreground">
          {label}
          {href && <MoveUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />}
        </p>
      </div>

      {series && series.length > 1 && <SparkArea data={series} color={TONE_SPARK[tone]} className="mt-3 -mb-1" />}
    </>
  );

  const shell = cn(
    'group block rounded-xl border border-border/80 bg-surface p-3.5 shadow-elev-1',
    'transition-[box-shadow,transform,border-color] duration-200 ease-standard',
    href && 'hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-elev-3 active:translate-y-0',
    className,
  );

  return href ? (
    <Link href={href} className={cn(shell, 'focus-ring')}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
