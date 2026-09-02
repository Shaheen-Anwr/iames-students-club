'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/motion';
import { ConsoleSidebar } from './ConsoleSidebar';
import { ConsoleTopbar } from './ConsoleTopbar';
import { AdminCommandPalette } from './AdminCommandPalette';
import { useConsoleUi } from './ConsoleUiContext';
import { TableSkeleton } from '../AdminSkeletons';

export function AdminConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { railCollapsed, mobileNavOpen, setMobileNavOpen } = useConsoleUi();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K anywhere in the console opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile nav on route change.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className={cn(
          'hidden shrink-0 border-e border-border bg-surface transition-[width] duration-200 ease-standard lg:block',
          railCollapsed ? 'w-[60px]' : 'w-60',
        )}
      >
        <ConsoleSidebar variant="rail" />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen} bare className="max-h-[85vh] lg:hidden">
        <ConsoleSidebar variant="drawer" onNavigate={() => setMobileNavOpen(false)} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleTopbar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transitions.smooth}
            className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6"
          >
            {/* Panels read the URL via useSearchParams (useTableQuery) — keep a boundary above them. */}
            <Suspense fallback={<TableSkeleton />}>{children}</Suspense>
          </motion.div>
        </div>
      </div>

      <AdminCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
