'use client';

import { useMemo } from 'react';
import type { DailyCount } from '@/lib/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { nf } from '@/lib/format';
import { cn } from '@/lib/utils';

// Saturday-first week (Arab calendar): getDay() 6=Sat → row 0 … 5=Fri → row 6.
const rowOf = (iso: string) => (new Date(iso).getDay() + 1) % 7;
const DAY_LABELS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const STEP_CLASS = [
  'bg-surface-3',
  'bg-accent/25',
  'bg-accent/45',
  'bg-accent/65',
  'bg-accent',
];

function step(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

interface HeatmapProps {
  data: DailyCount[];
  className?: string;
}

/** GitHub-contributions grid: 7 rows (Sat→Fri) × N week columns, tone ramped by daily volume. */
export function Heatmap({ data, className }: HeatmapProps) {
  const { weeks, max } = useMemo(() => {
    if (!data.length) return { weeks: [] as (DailyCount | null)[][], max: 0 };
    const lead = rowOf(data[0].date);
    const cells: (DailyCount | null)[] = [...Array(lead).fill(null), ...data];
    const w: (DailyCount | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    return { weeks: w, max: Math.max(1, ...data.map((d) => d.count)) };
  }, [data]);

  if (!weeks.length) return null;

  return (
    <div className={cn('overflow-x-auto scrollbar-thin', className)} dir="ltr">
      <div className="flex gap-[3px]">
        {/* day-of-week gutter */}
        <div className="me-1 flex flex-col gap-[3px] text-[9px] leading-[10px] text-muted-foreground">
          {DAY_LABELS.map((d, i) => (
            <span key={d} className="h-[10px] w-8 text-end" style={{ visibility: i % 2 ? 'visible' : 'hidden' }}>
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, ri) => {
              const cell = week[ri];
              if (!cell) return <span key={ri} className="h-[10px] w-[10px]" />;
              return (
                <Tooltip
                  key={ri}
                  side="top"
                  content={`${cell.date} — ${nf(cell.count)}`}
                  wrapperClassName="block"
                >
                  <span
                    className={cn('block h-[10px] w-[10px] rounded-[2px]', STEP_CLASS[step(cell.count, max)])}
                  />
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
