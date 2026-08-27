'use client';

import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Extra classes for the sheet panel. */
  className?: string;
  /** Drop the handle + header chrome for fully custom content. */
  bare?: boolean;
  /** Allow swipe / scrim tap to dismiss (default true). */
  dismissible?: boolean;
}

/**
 * Bottom sheet -- the mobile-native equivalent of a dialog: slides up from the edge, drag it
 * down to dismiss, velocity-aware. Built on vaul (which handles the drag physics, scroll-vs-
 * drag detection, focus trap and iOS scroll-lock). Used directly for mobile-first surfaces and
 * as the phone presentation of <Modal>.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  bare,
  dismissible = true,
}: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-overlay/60 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-[60] mt-24 flex max-h-[92vh] flex-col rounded-t-2xl',
            'border-t border-border bg-surface shadow-elev-4 outline-none',
            'pb-[env(safe-area-inset-bottom)]',
            className,
          )}
        >
          {!bare && (
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden />
          )}

          <div className={cn('flex items-start justify-between gap-3 px-5', bare ? 'sr-only' : 'pb-2 pt-3')}>
            <div className="min-w-0">
              <Drawer.Title className="text-base font-semibold text-foreground">
                {title ?? ''}
              </Drawer.Title>
              {description && (
                <Drawer.Description className="mt-0.5 text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              )}
            </div>
            {!bare && dismissible && (
              <Drawer.Close
                aria-label="إغلاق"
                className="-me-1.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </Drawer.Close>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-5 pb-5 pt-1">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export const SheetClose = Drawer.Close;
