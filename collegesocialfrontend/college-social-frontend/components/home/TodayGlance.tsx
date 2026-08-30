'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, Flame, ListChecks } from 'lucide-react';
import { classPhase } from '@/lib/today';
import { useNotifications } from '@/lib/notifications-context';
import { cn } from '@/lib/utils';
import type { DueItem, ScheduleEntry } from '@/lib/types';

interface Tile {
  key: string;
  label: string;
  value: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  emphasise?: boolean;
}

/**
 * A four-up strip of the numbers a student checks first thing: next class time, tasks due
 * today, unread notifications, current streak. Each tile deep-links to the relevant screen.
 */
export function TodayGlance({
  schedule,
  dueToday,
  streak,
}: {
  schedule: ScheduleEntry[];
  dueToday: DueItem[];
  streak: number;
}) {
  const { unreadCount } = useNotifications();
  const phase = classPhase(schedule);

  const nextLabel =
    phase.kind === 'in-progress'
      ? 'الآن'
      : phase.kind === 'upcoming'
        ? phase.entry.startTime
        : phase.kind === 'done'
          ? 'انتهت'
          : '—';

  const tiles: Tile[] = [
    { key: 'class', label: 'المحاضرة', value: nextLabel, href: '/study/schedule', icon: CalendarClock, tone: 'bg-accent/10 text-accent' },
    {
      key: 'due',
      label: 'مهام اليوم',
      value: String(dueToday.length),
      href: '/study/assignments',
      icon: ListChecks,
      tone: 'bg-warning/10 text-warning',
      emphasise: dueToday.length > 0,
    },
    {
      key: 'notif',
      label: 'إشعارات',
      value: unreadCount > 99 ? '99+' : String(unreadCount),
      href: '/notifications',
      icon: Bell,
      tone: 'bg-accent/10 text-accent',
      emphasise: unreadCount > 0,
    },
    { key: 'streak', label: 'سلسلة', value: String(streak), href: '/profile', icon: Flame, tone: 'bg-warning/10 text-warning' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              'group flex items-center gap-2.5 rounded-2xl border bg-surface px-3 py-2.5 shadow-elev-1',
              'transition-[transform,box-shadow,border-color] duration-200 ease-standard',
              'hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-elev-3 active:translate-y-0',
              t.emphasise ? 'border-accent/25' : 'border-border/80',
            )}
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', t.tone)}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-none text-foreground">
                <bdi dir="ltr">{t.value}</bdi>
              </span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{t.label}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
