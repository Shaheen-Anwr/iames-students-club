'use client';

import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { DailyCount } from '@/lib/types';

// Semantic-token colour so it tracks light/dark without any client theme read (same trick the
// dashboard charts use).
const STROKE = 'rgb(var(--accent))';

interface SparkAreaProps {
  data: DailyCount[];
  height?: number;
  /** Override the line/fill colour (e.g. a warning-tinted tile). */
  color?: string;
  className?: string;
}

/**
 * Bare inline trend line — no axes, grid, tooltip or dots. Sits inside a StatCard under the
 * value. Purely decorative context for the number + delta above it.
 */
export function SparkArea({ data, height = 40, color = STROKE, className }: SparkAreaProps) {
  const gradId = useId().replace(/:/g, '');
  if (!data || data.length < 2) return <div style={{ height }} className={className} aria-hidden />;

  return (
    <div className={className} style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${gradId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
