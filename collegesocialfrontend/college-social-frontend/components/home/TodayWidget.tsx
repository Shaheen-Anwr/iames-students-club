import Link from 'next/link';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarClock, CheckCircle2, Clock3, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { DueItem, ScheduleEntry, Urgency } from '@/lib/types';

const URGENCY_BADGE: Record<Exclude<Urgency, 'completed' | 'normal'>, { label: string; variant: 'danger' | 'warning' }> = {
  overdue: { label: 'متأخر', variant: 'danger' },
  urgent: { label: 'يستحق قريبًا', variant: 'warning' },
};

const URGENCY_BORDER: Record<Urgency, string> = {
  overdue: 'border-s-4 border-s-danger',
  urgent: 'border-s-4 border-s-warning',
  normal: 'border-s-4 border-s-border',
  completed: 'border-s-4 border-s-success',
};

export function TodayWidget({ schedule, dueToday }: { schedule: ScheduleEntry[]; dueToday: DueItem[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">اليوم</h2>
      </div>

      {schedule.length === 0 && dueToday.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="text-sm text-muted-foreground">لا حصص ولا مواعيد نهائية قريبة. يوم هادئ!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedule.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">جدولك اليوم</p>
              {schedule.map((entry) => (
                <div key={entry._id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{entry.courseName}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {entry.startTime} - {entry.endTime}
                      {entry.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {entry.location}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">يستحق الانتباه</p>
              {dueToday.map((item) => {
                const badge = item.urgency === 'overdue' || item.urgency === 'urgent' ? URGENCY_BADGE[item.urgency] : null;
                const href = item.type === 'assignment' ? '/study/assignments' : '/study/planner';
                return (
                  <Link
                    key={`${item.type}-${item.id}`}
                    href={href}
                    className={cn('flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5 transition-colors hover:bg-surface-2', URGENCY_BORDER[item.urgency])}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.courseCode && `${item.courseCode} · `}
                        {format(new Date(item.dueDate), 'EEEE، d MMMM', { locale: ar })}
                      </p>
                    </div>
                    {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
