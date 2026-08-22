'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Bell, CheckCircle2, XCircle, X } from 'lucide-react';
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: Toast['variant'] = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-xl border bg-surface p-3 shadow-card animate-slide-up',
              toast.variant === 'success' && 'border-success/30',
              toast.variant === 'error' && 'border-danger/30',
              toast.variant === 'info' && 'border-accent/30',
            )}
          >
            {toast.variant === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />}
            {toast.variant === 'error' && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
            {toast.variant === 'info' && <Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent" />}
            <p className="flex-1 text-sm text-foreground">{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
