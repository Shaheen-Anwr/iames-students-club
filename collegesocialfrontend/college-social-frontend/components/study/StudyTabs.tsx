'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ClipboardList,
  CalendarDays,
  CalendarRange,
  Bookmark,
  Trophy,
  HelpCircle,
  ListTodo,
  Shield,
  Calculator,
  CalendarCheck,
  LineChart,
  ListChecks,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  label: string;
  icon: typeof BookOpen;
}

// The six a student touches most -- always visible.
const PRIMARY: Tab[] = [
  { href: '/study/courses', label: 'المقررات', icon: BookOpen },
  { href: '/study/schedule', label: 'الجدول', icon: CalendarDays },
  { href: '/study/assignments', label: 'الواجبات', icon: ClipboardList },
  { href: '/quizzes', label: 'الاختبارات', icon: ListChecks },
  { href: '/study/qa', label: 'الأسئلة', icon: HelpCircle },
  { href: '/study/calendar', label: 'التقويم', icon: CalendarRange },
];

// Everything else -- behind "المزيد".
const MORE: Tab[] = [
  { href: '/study/dashboard', label: 'لوحة تقدّمي', icon: LineChart },
  { href: '/study/planner', label: 'المخطط الدراسي', icon: ListTodo },
  { href: '/study/gpa', label: 'حساب المعدل', icon: Calculator },
  { href: '/study/attendance', label: 'الحضور', icon: CalendarCheck },
  { href: '/study/military', label: 'التربية العسكرية', icon: Shield },
  { href: '/study/leaderboard', label: 'المتصدرون', icon: Trophy },
  { href: '/study/saved', label: 'المحفوظات', icon: Bookmark },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function Pill({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95',
        active
          ? 'bg-surface text-accent shadow-elev-1 ring-1 ring-inset ring-accent/20'
          : 'text-muted-foreground hover:bg-surface/60 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {tab.label}
    </Link>
  );
}

export function StudyTabs() {
  const pathname = usePathname();
  const onMoreRoute = MORE.some((t) => isActive(pathname, t.href));
  const [open, setOpen] = useState(false);
  const showMore = open || onMoreRoute;

  return (
    <div className="space-y-2">
      <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-full bg-surface-2/70 p-1.5">
        {PRIMARY.map((tab) => (
          <Pill key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={showMore}
          className={cn(
            'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95',
            onMoreRoute
              ? 'bg-surface text-accent shadow-elev-1 ring-1 ring-inset ring-accent/20'
              : 'text-muted-foreground hover:bg-surface/60 hover:text-foreground',
          )}
        >
          المزيد
          <ChevronDown className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')} />
        </button>
      </div>

      {showMore && (
        <div className="flex flex-wrap gap-1 rounded-2xl bg-surface-2/50 p-1.5">
          {MORE.map((tab) => (
            <Pill key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
          ))}
        </div>
      )}
    </div>
  );
}
