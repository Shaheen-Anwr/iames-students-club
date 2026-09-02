'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Menu, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useSocket } from '@/lib/socket-context';
import { cn } from '@/lib/utils';
import { nf } from '@/lib/format';
import { crumbsFor } from './nav';
import { useConsoleUi } from './ConsoleUiContext';
import { useAdminStats } from '../AdminStatsProvider';

export function ConsoleTopbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { socket } = useSocket();
  const { setMobileNavOpen } = useConsoleUi();
  const { stats } = useAdminStats();

  const crumbs = crumbsFor(pathname);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    if (stats?.users.online != null) setOnline(stats.users.online);
  }, [stats?.users.online]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (p: { online: number }) => setOnline(p.online);
    socket.on('admin:presence', onPresence);
    return () => {
      socket.off('admin:presence', onPresence);
    };
  }, [socket]);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-xl sm:px-4">
      <button
        onClick={() => setMobileNavOpen(true)}
        aria-label="القائمة"
        className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px]" aria-label="مسار التنقل">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
              {c.href && !last ? (
                <Link href={c.href} className="shrink-0 text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className={cn('truncate', last ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {c.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        {online != null && (
          <span className="hidden items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success sm:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            {nf(online)} متصل
          </span>
        )}

        <button
          onClick={onOpenPalette}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-strong bg-surface px-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label="بحث سريع"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">بحث…</span>
          <kbd className="hidden rounded border border-border px-1 text-[10px] font-medium md:inline">⌘K</kbd>
        </button>

        <ThemeToggle />

        <Link
          href="/home"
          className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground sm:inline-flex"
        >
          ← التطبيق
        </Link>
      </div>
    </header>
  );
}
