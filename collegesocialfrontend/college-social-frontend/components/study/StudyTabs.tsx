'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ClipboardList, CalendarDays, CalendarRange, Bookmark, Trophy, HelpCircle, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/study/courses', label: 'المقررات', icon: BookOpen },
  { href: '/study/assignments', label: 'الواجبات', icon: ClipboardList },
  { href: '/study/planner', label: 'المخطط الدراسي', icon: ListTodo },
  { href: '/study/qa', label: 'الأسئلة والأجوبة', icon: HelpCircle },
  { href: '/study/calendar', label: 'التقويم', icon: CalendarRange },
  { href: '/study/schedule', label: 'الجدول الدراسي', icon: CalendarDays },
  { href: '/study/saved', label: 'المحفوظات', icon: Bookmark },
  { href: '/study/leaderboard', label: 'المتصدرون', icon: Trophy },
];

export function StudyTabs() {
  const pathname = usePathname();

  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-full bg-surface-2/70 p-1.5">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
              active ? 'bg-surface text-accent shadow-soft' : 'text-muted-foreground hover:text-foreground',
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
