'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'glass relative z-10 flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl p-5 shadow-card animate-slide-up',
          className,
        )}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
          <button onClick={onClose} className="ms-auto rounded-full p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
