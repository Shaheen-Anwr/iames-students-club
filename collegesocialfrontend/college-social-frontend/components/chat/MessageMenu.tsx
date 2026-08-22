'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface MessageMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface MessageMenuProps {
  open: boolean;
  onClose: () => void;
  items: MessageMenuItem[];
  align?: 'start' | 'end';
}

export function MessageMenu({ open, onClose, items, align = 'end' }: MessageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card animate-slide-up',
        align === 'end' ? 'end-0' : 'start-0',
      )}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={cn(
            'flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-sm transition-colors hover:bg-surface-2',
            item.danger ? 'text-danger' : 'text-foreground',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
