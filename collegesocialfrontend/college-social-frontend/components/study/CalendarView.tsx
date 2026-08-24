'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  ListTodo,
  MapPin,
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType } from '@/lib/types';
import { AddCalendarItemModal } from './AddCalendarItemModal';

const WEEKDAY_LABELS = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

// Only these two kinds are ever deletable from here -- everything else (class/assignment/task/
// announcement) is owned by another feature (schedule/assignments/planner/announcements) and
// managed from there instead.
const DELETABLE_TYPES: CalendarEventType[] = ['event', 'reminder'];

const EVENT_DOT_COLOR: Record<CalendarEventType, string> = {
  class: 'bg-accent',
  assignment: 'bg-warning',
  task: 'bg-success',
  announcement: 'bg-danger',
  event: 'bg-accent-2',
  reminder: 'bg-warning',
};

const EVENT_ICON: Record<CalendarEventType, typeof GraduationCap> = {
  class: GraduationCap,
  assignment: ClipboardList,
  task: ListTodo,
  announcement: Megaphone,
  event: CalendarPlus,
  reminder: Bell,
};

const EVENT_ICON_COLOR: Record<CalendarEventType, string> = {
  class: 'text-accent',
  assignment: 'text-warning',
  task: 'text-success',
  announcement: 'text-danger',
  event: 'text-accent-2',
  reminder: 'text-warning',
};

export function CalendarView() {
  const { showToast } = useToast();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    return api
      .get<CalendarEvent[]>(`/calendar?month=${cursor.getMonth() + 1}&year=${cursor.getFullYear()}`)
      .then(setEvents)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/calendar-events/${id}`);
      await refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر الحذف.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 6 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 6 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedEvents = eventsByDate.get(selectedKey) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{format(cursor, 'MMMM yyyy', { locale: ar })}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((prev) => subMonths(prev, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2"
          >
            اليوم
          </button>
          <button
            onClick={() => setCursor((prev) => addMonths(prev, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDate.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const selected = isSameDay(day, selectedDate);
              const today = isToday(day);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'flex h-16 flex-col items-center gap-1 rounded-xl border p-1 text-xs transition-colors sm:h-20',
                    inMonth ? 'border-border bg-surface' : 'border-transparent bg-transparent text-muted-foreground/50',
                    today && !selected && 'border-accent/30 bg-accent/10 ring-1 ring-inset ring-accent/20',
                    selected && 'border-accent bg-accent/5 shadow-soft',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full font-semibold',
                      today && 'bg-gradient-accent text-white shadow-glow',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {dayEvents.slice(0, 3).map((event, idx) => (
                        <span key={idx} className={cn('h-1.5 w-1.5 rounded-full', EVENT_DOT_COLOR[event.type])} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{format(selectedDate, 'EEEE، d MMMM', { locale: ar })}</h3>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CalendarClock className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">لا توجد أحداث في هذا اليوم.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((event, idx) => {
                  const Icon = EVENT_ICON[event.type];
                  const deletable = DELETABLE_TYPES.includes(event.type) && event.id;
                  return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2/70', EVENT_ICON_COLOR[event.type])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm font-medium text-foreground">{event.title}</p>
                      {event.type === 'class' ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {event.startTime} - {event.endTime}
                          {event.location && (
                            <span className="ms-2 inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          )}
                        </p>
                      ) : event.type === 'event' || event.type === 'reminder' ? (
                        <>
                          {event.startTime && <p className="mt-0.5 text-xs text-muted-foreground">{event.startTime}</p>}
                          {event.notes && <p className="mt-0.5 text-xs text-muted-foreground">{event.notes}</p>}
                        </>
                      ) : (
                        event.courseCode && <p className="mt-0.5 text-xs text-muted-foreground">{event.courseCode}</p>
                      )}
                    </div>
                    {deletable && (
                      <button
                        onClick={() => handleDelete(event.id!)}
                        disabled={deletingId === event.id}
                        title="حذف"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Card>

          <AddCalendarItemModal open={addOpen} onClose={() => setAddOpen(false)} date={selectedDate} onCreated={refresh} />
        </>
      )}
    </div>
  );
}
