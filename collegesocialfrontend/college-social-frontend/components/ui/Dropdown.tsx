'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
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
  placement?: 'bottom' | 'top';
  className?: string;
}

const MENU_WIDTH = 192; // w-48
const GAP = 8; // matches the old mt-2/mb-2

// Renders the menu in a portal at document.body, positioned from the trigger's live
// bounding rect (fixed positioning). This is deliberate: several call sites (avatar/cover
// photo uploaders) sit inside an `overflow-hidden` ancestor used to clip rounded card
// corners, which silently clipped an in-flow `absolute` menu regardless of which edge it
// opened from. Computing screen coordinates sidesteps that ancestor entirely.
export function Dropdown({ trigger, items, align = 'end', placement = 'bottom', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rtl = document.documentElement.dir === 'rtl';
      const anchorLeft = (align === 'end') === rtl;
      const next: CSSProperties = { position: 'fixed', width: MENU_WIDTH };
      if (anchorLeft) next.left = rect.left;
      else next.right = window.innerWidth - rect.right;
      if (placement === 'top') next.bottom = window.innerHeight - rect.top + GAP;
      else next.top = rect.bottom + GAP;
      setStyle(next);
    }

    updatePosition();

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onDismiss() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [open, align, placement]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={style}
            className={cn('glass z-40 rounded-xl p-1 shadow-card animate-bubble-in', className)}
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
          </div>,
          document.body,
        )}
    </>
  );
}
