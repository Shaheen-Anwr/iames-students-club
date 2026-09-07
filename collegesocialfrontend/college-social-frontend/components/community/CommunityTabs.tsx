'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Newspaper, Clapperboard, MessagesSquare, CalendarHeart, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

// The "المجتمع" hub strip -- one row across the five community surfaces. اكاديميا is a launch
// target (its own immersive view), the rest render below this strip via CommunityShell.
const TABS = [
  { href: '/feed', label: 'المنشورات', icon: Newspaper },
  { href: '/reels', label: 'اكاديميا', icon: Clapperboard },
  { href: '/wall', label: 'الجدار', icon: MessagesSquare },
  { href: '/events', label: 'الفعاليات', icon: CalendarHeart },
  { href: '/marketplace', label: 'السوق', icon: Store },
];

export function CommunityTabs() {
  const pathname = usePathname();

  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-full bg-surface-2/70 p-1.5">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95',
              active
                ? 'bg-surface text-accent shadow-elev-1 ring-1 ring-inset ring-accent/20'
                : 'text-muted-foreground hover:bg-surface/60 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
