'use client';

import { cn } from '@/lib/utils';

/**
 * Small ring gauge for a student's daily AI-question quota. The arc fills clockwise as `used`
 * approaches `limit`; it's accent-coloured normally, amber with ≤10% left, and red once spent.
 * Pass `showLabel` for a trailing `used/limit` count.
 */
export function AiUsageMeter({
  used,
  limit,
  size = 22,
  showLabel = false,
  className,
}: {
  used: number;
  limit: number;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const safeLimit = Math.max(1, limit);
  const ratio = Math.min(1, Math.max(0, used / safeLimit));
  const remaining = Math.max(0, limit - used);
  const stroke = size <= 20 ? 2 : 2.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const tone =
    remaining === 0
      ? 'text-danger'
      : remaining <= Math.ceil(safeLimit * 0.1)
        ? 'text-warning'
        : 'text-accent';

  const title =
    remaining === 0
      ? `انتهت أسئلتك لليوم (${limit}/${limit})`
      : `استخدمت ${used} من ${limit} سؤالًا اليوم — يتبقّى ${remaining}`;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={title} aria-label={title}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={tone}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="rgb(var(--border) / 0.7)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <span
          className={cn(
            'text-[11px] font-medium tabular-nums',
            remaining === 0 ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {used}/{limit}
        </span>
      )}
    </span>
  );
}
