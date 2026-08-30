'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ClipboardList, CalendarDays, CalendarRange, Bookmark, Trophy, HelpCircle, ListTodo, Shield, Calculator, CalendarCheck, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/study/dashboard', label: 'لوحة تقدّمي', icon: LineChart },
  { href: '/study/courses', label: 'المقررات', icon: BookOpen },
  { href: '/study/assignments', label: 'الواجبات', icon: ClipboardList },
  { href: '/study/military', label: 'التربية العسكرية', icon: Shield },
  { href: '/study/planner', label: 'المخطط الدراسي', icon: ListTodo },
  { href: '/study/gpa', label: 'حساب المعدل', icon: Calculator },
  { href: '/study/qa', label: 'الأسئلة والأجوبة', icon: HelpCircle },
  { href: '/study/calendar', label: 'التقويم', icon: CalendarRange },
  { href: '/study/schedule', label: 'الجدول الدراسي', icon: CalendarDays },
  { href: '/study/attendance', label: 'الحضور', icon: CalendarCheck },
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
