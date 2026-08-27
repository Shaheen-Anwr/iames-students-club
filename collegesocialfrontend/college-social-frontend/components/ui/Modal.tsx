'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-media-query';
import { Sheet } from './Sheet';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Panel classes -- applied on the desktop dialog (e.g. `max-w-lg`). Ignored on the mobile
   *  sheet, which is always full-width. */
  className?: string;
}

/**
 * Responsive dialog. On phones it presents as a drag-to-dismiss bottom sheet (native feel,
 * thumb-reachable close); on tablet/desktop it's a centred dialog. Same
 * `{ open, onClose, title }` API as before, so callers don't change.
 *
 * a11y -- focus trap, ESC, scroll-lock, aria wiring -- comes from Radix Dialog / vaul.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
        {children}
      </Sheet>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Radix nags about a missing description; not every modal has one.
          aria-describedby={undefined}
          className={cn(
            'glass fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl p-5 shadow-elev-4 outline-none',
            'data-[state=open]:animate-scale-in',
            className,
          )}
        >
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
            <Dialog.Title className={cn('text-base font-semibold text-foreground', !title && 'sr-only')}>
              {title ?? 'حوار'}
            </Dialog.Title>
            <Dialog.Close
              aria-label="إغلاق"
              className="-me-1.5 ms-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thin">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
