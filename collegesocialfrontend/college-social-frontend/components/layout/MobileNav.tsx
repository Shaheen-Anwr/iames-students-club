'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { getNavItems } from './nav-items';

// Only the handful of destinations a student jumps to constantly live in the bar itself --
// everything else (quizzes, lectures, groups, profile, admin) opens from "المزيد" below, since
// cramming all ~9-10 nav-items.ts routes into one row is what made this bar overflow/wrap before.
const PRIMARY_HREFS = ['/home', '/feed', '/study', '/chat'];

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = getNavItems(user?.role);
  const primary = PRIMARY_HREFS.map((href) => items.find((i) => i.href === href)).filter(Boolean) as typeof items;
  const more = items.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = more.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-0 md:hidden">
        <div className="glass mx-auto flex max-w-sm items-center justify-around rounded-[1.75rem] p-1.5 shadow-card ring-1 ring-border/60">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className="flex h-12 w-12 items-center justify-center transition-transform active:scale-90"
              >
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl transition-all',
                    active ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            title="المزيد"
            className="flex h-12 w-12 items-center justify-center transition-transform active:scale-90"
          >
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl transition-all',
                moreActive ? 'bg-gradient-accent text-white shadow-glow' : 'text-muted-foreground',
              )}
            >
              <LayoutGrid className="h-5 w-5" />
            </span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="glass fixed inset-x-0 bottom-0 z-40 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card animate-slide-up md:hidden">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-4 gap-3">
              {more.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition-colors',
                      active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-medium leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
