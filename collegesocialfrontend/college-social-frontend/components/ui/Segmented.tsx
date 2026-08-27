'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Fill the container and split evenly -- the usual choice on mobile. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * iOS-style segmented control -- a pill track with a sliding thumb under the active segment.
 * Good for 2–4 mutually exclusive view switches where tabs would be too heavy.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth,
  className,
}: SegmentedProps<T>) {
  const thumbId = useId();

  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex rounded-xl bg-surface-2 p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex select-none items-center justify-center gap-1.5 rounded-lg font-medium',
              'transition-colors duration-fast ease-standard touch-manipulation',
              fullWidth && 'flex-1',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                transition={transitions.snappy}
                className="absolute inset-0 rounded-lg bg-surface shadow-elev-1"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon && <opt.icon className="h-4 w-4" />}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
