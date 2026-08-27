'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  // Unique per instance so two tab bars on one screen don't animate their indicators into
  // each other via a shared layoutId.
  const indicatorId = useId();

  return (
    <div
      role="tablist"
      className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-thin', className)}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={cn(
              // min-h-11 gives a proper touch target on phones; tightens on desktop.
              'relative flex min-h-11 shrink-0 select-none items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium',
              'transition-colors duration-fast ease-standard md:min-h-0',
              selected ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {label}
            {selected && (
              <motion.span
                layoutId={indicatorId}
                transition={transitions.snappy}
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
