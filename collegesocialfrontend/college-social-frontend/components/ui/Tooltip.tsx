'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'start' | 'end';
  children: React.ReactNode;
  className?: string;
  /** Classes for the positioning wrapper itself (e.g. to let it grow inside a flex row). */
  wrapperClassName?: string;
}

// 'top'/'bottom' center horizontally via a full-width flex wrapper + justify-center rather than
// the usual start-1/2 + -translate-x-1/2 trick -- that trick breaks under RTL, since `start` is
// logical (flips to the right edge) but `-translate-x-1/2` is always physical (always shifts
// left), so the two don't cancel out and the tooltip drifts off-center. 'start'/'end' don't need
// this: they anchor at an edge with a vertical -translate-y-1/2, and translateY isn't direction-
// dependent, so the usual approach is safe there.
const wrapperSideClasses: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'inset-x-0 bottom-full mb-2 flex justify-center',
  bottom: 'inset-x-0 top-full mt-2 flex justify-center',
  start: 'end-full top-1/2 -translate-y-1/2 me-2 flex',
  end: 'start-full top-1/2 -translate-y-1/2 ms-2 flex',
};

export function Tooltip({ content, side = 'top', children, className, wrapperClassName }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  let timer: ReturnType<typeof setTimeout>;

  return (
    <span
      className={cn('relative inline-flex', wrapperClassName)}
      onMouseEnter={() => {
        timer = setTimeout(() => setVisible(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timer);
        setVisible(false);
      }}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className={cn('pointer-events-none absolute z-50', wrapperSideClasses[side])}>
          <span
            role="tooltip"
            className={cn(
              'glass whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground shadow-card animate-fade-in',
              className,
            )}
          >
            {content}
          </span>
        </span>
      )}
    </span>
  );
}
