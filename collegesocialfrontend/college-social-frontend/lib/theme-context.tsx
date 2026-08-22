'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const THEME_STORAGE_KEY = 'theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The blocking script in app/layout.tsx already applied the right class before paint;
  // this just mirrors that into React state (defaulting to 'dark' to match that script).
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(stored === 'light' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
