'use client';

import { cn } from '@/lib/utils';

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
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-thin', className)}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === id
              ? 'border-accent text-accent'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}
