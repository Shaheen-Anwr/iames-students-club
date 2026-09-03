'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, Check, GraduationCap, PenLine, Users, UsersRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useOnboarding, type ChecklistKey } from '@/lib/onboarding';
import { captureEvent } from '@/lib/observability';
import { cn } from '@/lib/utils';

const ITEMS: Record<ChecklistKey, { label: string; href: string; icon: typeof Check }> = {
  set_department: { label: 'حدّد شعبتك وسنتك', href: '/profile', icon: GraduationCap },
  enable_push: { label: 'فعّل إشعارات الهاتف', href: '/profile', icon: BellRing },
  add_friend: { label: 'أضف أول صديق', href: '/friends', icon: UsersRound },
  join_group: { label: 'انضم إلى مجموعة دراسة', href: '/groups', icon: Users },
  first_post: { label: 'انشر أول منشور', href: '/feed', icon: PenLine },
};

// Shown on /home during the student's first week until every item is checked. Dismissible for
// the session (not persisted -- it stops on its own once completed or the week ends).
export function FirstWeekChecklist() {
  const { user } = useAuth();
  const { data } = useOnboarding(!!user);
  const [hidden, setHidden] = useState(false);

  // Fire the activation event once per browser when the metric first reads true.
  useEffect(() => {
    if (!data?.activated || !user || typeof window === 'undefined') return;
    const key = `activation-fired:${user._id}`;
    try {
      if (window.localStorage.getItem(key) === '1') return;
      window.localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    captureEvent('activation_reached', { active_days: data.activeDays });
  }, [data?.activated, data?.activeDays, user]);

  if (!data || !data.showChecklist || hidden) return null;

  const done = data.checklist.filter((c) => c.done).length;
  const total = data.checklist.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="relative rounded-2xl border border-accent/25 bg-accent/5 p-4">
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="إخفاء"
        className="absolute end-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0">
          <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(var(--border))" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-accent">
            {done}/{total}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">جهّز حسابك</p>
          <p className="text-xs text-muted-foreground">أكمل الخطوات لتحصل على أفضل تجربة في أسبوعك الأول.</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {data.checklist.map(({ key, done: itemDone }) => {
          const meta = ITEMS[key];
          const Icon = itemDone ? Check : meta.icon;
          return (
            <li key={key}>
              <Link
                href={meta.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                  itemDone ? 'text-muted-foreground' : 'text-foreground hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    itemDone ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className={cn(itemDone && 'line-through')}>{meta.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
