'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { WEEK_DAYS, courseColor } from '@/lib/schedule-week';
import type { AttendanceOccurrence, AttendanceStatus, AttendanceSummary, AttendanceWeek } from '@/lib/types';

const STATUS_META: Record<AttendanceStatus, { label: string; active: string }> = {
  attended: { label: 'حضر', active: 'bg-emerald-500 text-white border-emerald-500' },
  absent: { label: 'غاب', active: 'bg-red-500 text-white border-red-500' },
  excused: { label: 'بعذر', active: 'bg-amber-500 text-white border-amber-500' },
  cancelled: { label: 'أُلغيت', active: 'bg-slate-400 text-white border-slate-400' },
};
const STATUS_ORDER: AttendanceStatus[] = ['attended', 'absent', 'excused', 'cancelled'];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}
function currentSaturdayIso(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 1) % 7));
  return isoDay(utc);
}
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
function dayLabel(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return WEEK_DAYS.find((w) => w.value === dow)?.label ?? '';
}

export function AttendanceTracker() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isStudent = user?.role === 'student';

  const [weekStart, setWeekStart] = useState<string>(currentSaturdayIso());
  const [week, setWeek] = useState<AttendanceWeek | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(() => {
    api.get<AttendanceSummary>('/attendance/summary').then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isStudent) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<AttendanceWeek>(`/attendance/week?start=${weekStart}`)
      .then(setWeek)
      .catch(() => showToast('تعذّر تحميل سجل الحضور', 'error'))
      .finally(() => setLoading(false));
  }, [isStudent, weekStart, showToast]);

  useEffect(() => {
    if (isStudent) loadSummary();
  }, [isStudent, loadSummary]);

  const byDay = useMemo(() => {
    const map = new Map<string, AttendanceOccurrence[]>();
    for (const o of week?.occurrences ?? []) {
      const list = map.get(o.date) ?? [];
      list.push(o);
      map.set(o.date, list);
    }
    return [...map.entries()];
  }, [week]);

  async function mark(o: AttendanceOccurrence, status: AttendanceStatus | null) {
    const next = o.status === status ? null : status;
    setWeek((prev) =>
      prev
        ? {
            ...prev,
            occurrences: prev.occurrences.map((x) =>
              x.scheduleEntryId === o.scheduleEntryId && x.date === o.date ? { ...x, status: next } : x,
            ),
          }
        : prev,
    );
    try {
      await api.put('/attendance', { scheduleEntryId: o.scheduleEntryId, date: o.date, status: next });
      loadSummary();
    } catch (err) {
      setWeek((prev) =>
        prev
          ? {
              ...prev,
              occurrences: prev.occurrences.map((x) =>
                x.scheduleEntryId === o.scheduleEntryId && x.date === o.date ? { ...x, status: o.status } : x,
              ),
            }
          : prev,
      );
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الحضور', 'error');
    }
  }

  if (!isStudent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          <CalendarCheck className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-foreground">تتبّع الحضور أداة خاصة بالطلاب</p>
        <p className="text-xs text-muted-foreground">يعتمد على الجدول الدراسي المنشور لفئة الطالب.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const weekEnd = addDays(weekStart, 6);
  const hasSessions = (week?.occurrences.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-foreground">الحضور</h1>
      </div>

      {/* Per-course summary */}
      {summary && summary.courses.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">نسبة الحضور الكلية</span>
            <span className="font-bold tabular-nums text-accent">{summary.overall.percent}%</span>
          </div>
          <div className="space-y-2.5">
            {summary.courses.map((c) => (
              <div key={c.courseName}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{c.courseName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {c.attended}/{c.counted} · {c.percent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      c.percent >= 75 ? 'bg-emerald-500' : c.percent >= 50 ? 'bg-amber-500' : 'bg-red-500',
                    )}
                    style={{ width: `${c.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          <ChevronRight className="h-4 w-4" />
          الأسبوع السابق
        </Button>
        <button
          type="button"
          onClick={() => setWeekStart(currentSaturdayIso())}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {shortDate(weekStart)} – {shortDate(weekEnd)}
        </button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          الأسبوع التالي
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {!hasSessions ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CalendarCheck className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">لا محاضرات في هذا الأسبوع</p>
            <p className="text-xs text-muted-foreground">
              يظهر هنا كل موعد من جدولك الدراسي المنشور، لتحدّد حضورك فيه.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(([date, sessions]) => (
            <div key={date}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                {dayLabel(date)} <span className="opacity-60">{shortDate(date)}</span>
              </h2>
              <div className="space-y-2">
                {sessions.map((o) => (
                  <Card key={`${o.scheduleEntryId}-${o.date}`} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1 h-8 w-1.5 shrink-0 rounded-full border', courseColor(o.courseName))} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{o.courseName}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {o.startTime} - {o.endTime}
                          </span>
                          {o.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {o.location}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => mark(o, s)}
                          className={cn(
                            'rounded-lg border px-1 py-1.5 text-xs font-medium transition-colors',
                            o.status === s
                              ? STATUS_META[s].active
                              : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
