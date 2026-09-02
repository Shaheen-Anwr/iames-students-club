'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const RAIL_KEY = 'admin:rail';

interface ConsoleUiValue {
  /** Desktop sidebar collapsed to a 60px icon rail. Persisted. */
  railCollapsed: boolean;
  toggleRail: () => void;
  /** Mobile slide-in nav sheet. */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const ConsoleUiContext = createContext<ConsoleUiValue | null>(null);

export function ConsoleUiProvider({ children }: { children: ReactNode }) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      setRailCollapsed(localStorage.getItem(RAIL_KEY) === '1');
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  function toggleRail() {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <ConsoleUiContext.Provider value={{ railCollapsed, toggleRail, mobileNavOpen, setMobileNavOpen }}>
      {children}
    </ConsoleUiContext.Provider>
  );
}

export function useConsoleUi(): ConsoleUiValue {
  const ctx = useContext(ConsoleUiContext);
  if (!ctx) throw new Error('useConsoleUi must be used within <ConsoleUiProvider>');
  return ctx;
}
