'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-media-query';
import { Sheet } from '@/components/ui/Sheet';

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Pinned action row at the bottom of the panel. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Record inspector. Desktop: a panel that slides in from the inline-end edge, full height, over
 * a scrim. Mobile: the app's drag-to-dismiss bottom `Sheet`. Same `{ open, onOpenChange }` API
 * either way.
 */
export function DetailDrawer({ open, onOpenChange, title, description, children, footer, className }: DetailDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} className={className}>
        {children}
        {footer && <div className="sticky bottom-0 mt-4 border-t border-border bg-surface pt-3">{footer}</div>}
      </Sheet>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-overlay/50 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 end-0 z-[70] flex w-full max-w-md flex-col border-s border-border bg-surface shadow-elev-4 outline-none',
            'transition-transform duration-300 ease-emphasized',
            'data-[state=closed]:translate-x-full rtl:data-[state=closed]:-translate-x-full',
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold text-foreground">{title ?? ''}</Dialog.Title>
              {description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>}
            </div>
            <Dialog.Close
              aria-label="إغلاق"
              className="-me-1.5 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>

          {footer && <div className="shrink-0 border-t border-border px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
