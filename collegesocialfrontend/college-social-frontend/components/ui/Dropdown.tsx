'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            'glass absolute top-full z-40 mt-2 w-48 rounded-xl p-1 shadow-card animate-bubble-in',
            align === 'end' ? 'end-0' : 'start-0',
            className,
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                item.destructive ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-surface-2',
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
