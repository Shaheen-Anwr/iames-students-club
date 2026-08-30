'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { CalendarClock, CheckCircle2, Circle, Clock3, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn, timeAgo } from '@/lib/utils';
import type { DueItem, ScheduleEntry, Urgency } from '@/lib/types';

const URGENCY_BADGE: Record<Exclude<Urgency, 'completed' | 'normal'>, { label: string; variant: 'danger' | 'warning' }> = {
  overdue: { label: 'متأخر', variant: 'danger' },
  urgent: { label: 'يستحق قريبًا', variant: 'warning' },
};

// Inset urgency rail (rounded pill at the row's start edge) rather than a hard 4px border.
const RAIL = 'relative before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full';
const URGENCY_BORDER: Record<Urgency, string> = {
  overdue: `${RAIL} before:bg-danger`,
  urgent: `${RAIL} before:bg-warning`,
  normal: `${RAIL} before:bg-border`,
  completed: `${RAIL} before:bg-success`,
};

function itemKey(item: DueItem) {
  return `${item.type}-${item.id}`;
}

export function TodayWidget({ schedule, dueToday }: { schedule: ScheduleEntry[]; dueToday: DueItem[] }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isTeachingStaff = user?.role === 'professor' || user?.role === 'admin';

  const [items, setItems] = useState(dueToday);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setItems(dueToday);
    setDoneKeys(new Set());
    setPendingKeys(new Set());
  }, [dueToday]);

  async function handleComplete(item: DueItem) {
    const key = itemKey(item);
    if (doneKeys.has(key) || pendingKeys.has(key)) return;

    setPendingKeys((prev) => new Set(prev).add(key));
    setDoneKeys((prev) => new Set(prev).add(key));

    try {
      if (item.type === 'planner') {
        await api.post(`/planner/${item.id}/toggle`);
      } else {
        await api.post(`/assignments/${item.id}/complete`);
      }
      showToast('أحسنت! تم إنجاز المهمة', 'success');
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => itemKey(i) !== key));
      }, 400);
    } catch (err) {
      setDoneKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث المهمة', 'error');
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const isEmpty = schedule.length === 0 && items.length === 0;

  return (
    <Card className="p-4">
      <SectionHeader
        icon={CalendarClock}
        title="اليوم"
        action={
          items.length > 0 ? (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
              {items.length} يحتاج انتباهك
            </span>
          ) : undefined
        }
      />

      {isEmpty ? (
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

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">يستحق الانتباه</p>
              {items.map((item) => {
                const badge = item.urgency === 'overdue' || item.urgency === 'urgent' ? URGENCY_BADGE[item.urgency] : null;
                const href = item.type === 'assignment' ? '/study/assignments' : '/study/planner';
                const key = itemKey(item);
                const done = doneKeys.has(key);
                const canToggle = item.type === 'planner' || !isTeachingStaff;

                return (
                  <SwipeableRow
                    key={key}
                    disabled={!canToggle || done}
                    action={{ icon: CheckCircle2, label: 'وضع علامة كمُنجزة', tone: 'success', onAction: () => handleComplete(item) }}
                  >
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5 transition-all duration-300',
                      URGENCY_BORDER[item.urgency],
                      done && 'opacity-50',
                    )}
                  >
                    {canToggle ? (
                      <button
                        type="button"
                        onClick={() => handleComplete(item)}
                        disabled={done}
                        aria-label="وضع علامة كمُنجزة"
                        className="shrink-0 text-muted-foreground transition-transform hover:scale-110 hover:text-accent active:scale-90 disabled:pointer-events-none"
                      >
                        {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                      </button>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                        <Clock3 className="h-4 w-4" />
                      </div>
                    )}
                    <Link href={href} className="min-w-0 flex-1 hover:opacity-80">
                      <p className={cn('truncate text-sm font-medium text-foreground', done && 'line-through')}>{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.courseCode && `${item.courseCode} · `}
                        {timeAgo(item.dueDate)}
                        <span className="mx-1">·</span>
                        {format(new Date(item.dueDate), 'EEEE، d MMMM', { locale: ar })}
                      </p>
                    </Link>
                    {badge && !done && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  </div>
                  </SwipeableRow>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
