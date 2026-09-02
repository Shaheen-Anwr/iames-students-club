'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionLink';
import { LayoutGrid } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { transitions } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useChatUnread } from '@/lib/chat-unread-context';
import { Sheet } from '@/components/ui/Sheet';
import { getPrimaryNavItems, getSecondaryNavItems } from './nav-items';

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const chatUnread = useChatUnread();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreQuery, setMoreQuery] = useState('');

  const primary = getPrimaryNavItems(user?.role);
  const more = getSecondaryNavItems(user?.role);
  const moreActive = more.some((i) => isActive(pathname, i.href));
  const q = moreQuery.trim();
  const filteredMore = q ? more.filter((i) => i.label.includes(q)) : more;

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
              const badge = href === '/chat' ? chatUnread : 0;
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
                    <span className="relative shrink-0">
                      <Icon className="h-5 w-5 shrink-0" />
                      {badge > 0 && (
                        <span
                          className={cn(
                            'absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2',
                            active ? 'bg-white text-accent ring-accent' : 'bg-accent text-white ring-background',
                          )}
                        >
                          {badge > 9 ? '9+' : badge}
                        </span>
                      )}
                    </span>
                    {/* Active item expands to show its label; the width change animates. Hidden
                        below 360px, where five items + an expanded label would overflow the pill. */}
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={transitions.snappy}
                          className="hidden overflow-hidden whitespace-nowrap text-[13px] font-semibold min-[360px]:block"
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
                  <span className="hidden whitespace-nowrap text-[13px] font-semibold min-[360px]:inline">
                    المزيد
                  </span>
                )}
              </span>
            </button>
          </LayoutGroup>
        </div>
      </nav>

      <Sheet
        open={moreOpen}
        onOpenChange={(o) => {
          setMoreOpen(o);
          if (!o) setMoreQuery('');
        }}
        title="المزيد"
      >
        <input
          value={moreQuery}
          onChange={(e) => setMoreQuery(e.target.value)}
          placeholder="ابحث في القائمة..."
          className="mb-3 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25 md:text-sm"
        />
        {filteredMore.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">لا توجد نتائج</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredMore.map(({ href, label, icon: Icon }) => {
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
        )}
      </Sheet>
    </>
  );
}
