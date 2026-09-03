'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Megaphone, MessageCircle, Undo2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRawQuery } from '@/lib/query';

interface Since {
  since: string;
  newLectures: number;
  newAnnouncements: number;
  repliesToYou: number;
  empty: boolean;
}

const KEY = 'home:sinceLastSeen';

// A one-line "since you were away" strip at the top of /home. Compares against a per-device
// timestamp in localStorage, then advances it -- so it reflects what changed since the *previous*
// visit, and quietly disappears on a refresh. Renders nothing when there's nothing to report.
export function SinceLastSeen() {
  const { user } = useAuth();
  const [prev] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const [dismissed, setDismissed] = useState(false);
  const advanced = useRef(false);

  // Advance the baseline once, right away, so the next visit compares to now.
  useEffect(() => {
    if (advanced.current) return;
    advanced.current = true;
    try {
      window.localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, []);

  const { data } = useRawQuery<Since>(
    ['dashboard-since', prev ?? ''],
    `/dashboard/since${prev ? `?since=${encodeURIComponent(prev)}` : ''}`,
    { enabled: !!user && !!prev, staleTime: 5 * 60_000 },
  );

  if (!prev || dismissed || !data || data.empty) return null;

  const items: { icon: typeof BookOpen; text: string; href: string }[] = [];
  if (data.newLectures > 0)
    items.push({ icon: BookOpen, text: `${data.newLectures} محاضرة جديدة في مقرراتك`, href: '/lectures/pdf' });
  if (data.repliesToYou > 0)
    items.push({ icon: MessageCircle, text: `${data.repliesToYou} ردّ وتفاعل عليك`, href: '/notifications' });
  if (data.newAnnouncements > 0)
    items.push({ icon: Megaphone, text: `${data.newAnnouncements} إعلان جديد`, href: '/announcements' });

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2">
      <Undo2 className="h-4 w-4 shrink-0 text-accent" />
      <span className="shrink-0 text-[11px] font-semibold text-accent">منذ آخر زيارة</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-1 text-xs text-foreground/90 hover:text-accent"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {it.text}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="إخفاء"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
