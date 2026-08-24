'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
  ready: boolean;
}

const MENU_WIDTH = 176;
const VIEWPORT_PADDING = 8;
const GAP = 6;

export function MessageMenu({
  open,
  onClose,
  items,
  align = 'end',
  anchorRef,
}: MessageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    maxHeight: 320,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!open) {
      setPosition((prev) => ({ ...prev, ready: false }));
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const menu = ref.current;

      if (!anchor || !menu) return;

      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const menuWidth = Math.min(
        MENU_WIDTH,
        viewportWidth - VIEWPORT_PADDING * 2,
      );

      const menuHeight = menuRect.height;

      // Prefer below the button.
      const spaceBelow = viewportHeight - anchorRect.bottom - GAP - VIEWPORT_PADDING;
      const spaceAbove = anchorRect.top - GAP - VIEWPORT_PADDING;

      const shouldOpenAbove =
        spaceBelow < menuHeight && spaceAbove > spaceBelow;

      let top: number;

      if (shouldOpenAbove) {
        top = anchorRect.top - menuHeight - GAP;
      } else {
        top = anchorRect.bottom + GAP;
      }

      // Keep the popup vertically inside the viewport.
      const maxHeight = Math.max(
        120,
        Math.min(
          320,
          shouldOpenAbove ? spaceAbove : spaceBelow,
        ),
      );

      if (shouldOpenAbove) {
        top = Math.max(
          VIEWPORT_PADDING,
          Math.min(top, viewportHeight - VIEWPORT_PADDING - Math.min(menuHeight, maxHeight)),
        );
      } else {
        top = Math.max(VIEWPORT_PADDING, top);
      }

      // Horizontal positioning.
      let left: number;

      if (align === 'end') {
        left = anchorRect.right - menuWidth;
      } else {
        left = anchorRect.left;
      }

      // Keep the popup inside the viewport horizontally.
      left = Math.max(
        VIEWPORT_PADDING,
        Math.min(left, viewportWidth - menuWidth - VIEWPORT_PADDING),
      );

      setPosition({
        top,
        left,
        maxHeight,
        ready: true,
      });
    };

    // Wait until the portal menu has been mounted and measured.
    const frame = requestAnimationFrame(updatePosition);

    const handleViewportChange = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, anchorRef, align, items.length]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;

      // Don't close when clicking the menu itself.
      if (ref.current?.contains(target)) return;

      // Don't close when clicking the button that opened the menu.
      if (anchorRef.current?.contains(target)) return;

      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const menu = (
    <div
      ref={ref}
      className={cn(
        'fixed z-[100] overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-card',
        'animate-slide-up',
        'w-44 max-w-[calc(100vw-1rem)]',
      )}
      style={{
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={cn(
            'flex min-h-10 w-full items-center gap-2.5 px-3.5 py-2 text-start text-sm transition-colors',
            'hover:bg-surface-2 active:bg-surface-2',
            item.danger ? 'text-danger' : 'text-foreground',
          )}
        >
          {item.icon}
          <span className="min-w-0 truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}