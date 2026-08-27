'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Bell, CheckCircle2, XCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { transitions } from './motion';
import { cn } from './utils';

interface Toast {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, variant?: Toast['variant']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

const VARIANT_ICON = {
  success: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />,
  error: <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />,
  info: <Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent" />,
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: Toast['variant'] = 'success') => {
      const id = nextId++;
      // Keep the stack shallow -- drop the oldest once we're past the cap.
      setToasts((prev) => [...prev, { id, message, variant }].slice(-MAX_VISIBLE));
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Bottom-anchored + safe-area padded so it clears the iOS home indicator. Full-width and
          centred on phones (thumb-reachable, legible), a compact column bottom-end on desktop. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:end-4 sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={transitions.smooth}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 96 || Math.abs(info.velocity.x) > 400) dismiss(toast.id);
              }}
              role="status"
              aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm touch-pan-y items-start gap-2 rounded-xl border bg-surface p-3 shadow-elev-3',
                toast.variant === 'success' && 'border-success/30',
                toast.variant === 'error' && 'border-danger/30',
                toast.variant === 'info' && 'border-accent/30',
              )}
            >
              {VARIANT_ICON[toast.variant]}
              <p className="flex-1 text-sm text-foreground">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="إغلاق"
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
