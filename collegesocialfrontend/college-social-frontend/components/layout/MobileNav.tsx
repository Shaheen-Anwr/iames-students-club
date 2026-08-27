'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { Sheet } from '@/components/ui/Sheet';
import { getNavItems } from './nav-items';

// Only the handful of destinations a student jumps to constantly live in the bar itself --
// everything else (quizzes, lectures, groups, profile, admin) opens from "المزيد", since
// cramming all ~9-10 nav-items.ts routes into one row is what made this bar overflow/wrap before.
const PRIMARY_HREFS = ['/home', '/feed', '/study', '/chat'];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = getNavItems(user?.role);
  const primary = PRIMARY_HREFS.map((href) => items.find((i) => i.href === href)).filter(
    Boolean,
  ) as typeof items;
  const more = items.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = more.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav
        aria-label="التنقل الرئيسي"
        className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="glass mx-auto flex max-w-sm items-center justify-center gap-1 rounded-[1.75rem] p-1.5 shadow-elev-3 ring-1 ring-border/60">
          <LayoutGroup id="mobilenav">
            {primary.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex h-11 items-center justify-center rounded-2xl outline-none transition-transform active:scale-90"
                >
                  {/* Sliding "blob" -- one element that travels between items on route change. */}
                  {active && (
                    <motion.span
                      layoutId="mobilenav-blob"
                      transition={transitions.snappy}
                      className="absolute inset-0 rounded-2xl bg-gradient-accent shadow-glow"
                    />
                  )}
                  <span
                    className={cn(
                      'relative z-10 flex h-11 items-center gap-1.5 rounded-2xl px-3',
                      active ? 'text-white' : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {/* Active item expands to show its label; the width change animates. */}
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={transitions.snappy}
                          className="overflow-hidden whitespace-nowrap text-[13px] font-semibold"
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </Link>
              );
            })}

            <button
              onClick={() => setMoreOpen(true)}
              aria-label="المزيد"
              aria-haspopup="dialog"
              className="relative flex h-11 items-center justify-center rounded-2xl outline-none transition-transform active:scale-90"
            >
              {moreActive && !moreOpen && (
                <motion.span
                  layoutId="mobilenav-blob"
                  transition={transitions.snappy}
                  className="absolute inset-0 rounded-2xl bg-gradient-accent shadow-glow"
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex h-11 items-center gap-1.5 rounded-2xl px-3',
                  moreActive ? 'text-white' : 'text-muted-foreground',
                )}
              >
                <LayoutGrid className="h-5 w-5 shrink-0" />
                {moreActive && (
                  <span className="whitespace-nowrap text-[13px] font-semibold">المزيد</span>
                )}
              </span>
            </button>
          </LayoutGroup>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="المزيد">
        <div className="grid grid-cols-4 gap-2">
          {more.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition-colors active:scale-95',
                  active
                    ? 'bg-accent-100 text-accent-800'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
