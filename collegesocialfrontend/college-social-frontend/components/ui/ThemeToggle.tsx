'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
