'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { LoadError } from '@/components/ui/LoadError';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AnalyticsEvent, track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { ScheduleEntry } from '@/lib/types';
import { WEEK_DAYS, courseColor } from '@/lib/schedule-week';
import { ScheduleEntryForm } from './ScheduleEntryForm';
import { ScheduleEntryDetails } from './ScheduleEntryDetails';
import { ScheduleBoardPhoto } from './ScheduleBoardPhoto';

const SELECT_CLASS =
  'h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 21;
const HOUR_HEIGHT = 52; // px
const HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatHour(hour: number) {
  const period = hour < 12 ? 'ص' : 'م';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

// "الآن" / "التالية" banner at the top of the timetable -- the single thing a student opens the
// schedule to find out. Recomputed every 30s from `now`.
function NextClassBanner({ entries, now }: { entries: ScheduleEntry[]; now: Date }) {
  const info = useMemo(() => {
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const todays = entries
      .filter((e) => e.dayOfWeek === day)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    if (todays.length === 0) return { kind: 'none' as const };
    const current = todays.find((e) => toMinutes(e.startTime) <= mins && mins < toMinutes(e.endTime));
    if (current) return { kind: 'now' as const, entry: current };
    const next = todays.find((e) => toMinutes(e.startTime) > mins);
    if (next) return { kind: 'next' as const, entry: next, inMins: toMinutes(next.startTime) - mins };
    return { kind: 'done' as const };
  }, [entries, now]);

  if (info.kind === 'none') return null;

  if (info.kind === 'done') {
    return (
      <Card className="flex items-center gap-3 bg-success-surface p-4 text-success">
        <span className="text-lg">🎉</span>
        <p className="text-sm font-medium">انتهت محاضرات اليوم.</p>
      </Card>
    );
  }

  const { entry } = info;
  const isNow = info.kind === 'now';
  return (
    <Card className={cn('p-4', isNow ? 'bg-gradient-accent text-white shadow-glow' : 'ring-1 ring-accent/20')}>
      <div className="flex items-center gap-3">
        <span className={cn('relative flex h-2.5 w-2.5 shrink-0', !isNow && 'opacity-0')}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-[11px] font-bold uppercase tracking-wide', isNow ? 'text-white/80' : 'text-accent')}>
            {isNow ? 'الآن' : info.inMins <= 60 ? `بعد ${info.inMins} دقيقة` : 'محاضرتك القادمة'}
          </p>
          <p className={cn('truncate text-sm font-bold', isNow ? 'text-white' : 'text-foreground')}>{entry.courseName}</p>
          <p className={cn('mt-0.5 flex items-center gap-2 text-xs', isNow ? 'text-white/85' : 'text-muted-foreground')}>
            <span>
              {entry.startTime} - {entry.endTime}
              {isNow ? ' · ينتهي قريبًا' : ''}
            </span>
            {entry.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {entry.location}
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function ScheduleGrid() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | undefined>(undefined);
  // Whether the group has any whole-timetable photo(s) published (ScheduleBoardPhoto, above) --
  // used below so the entry-list empty state doesn't say "nothing published yet" when a photo
  // already covers that need.
  const [hasBoardPhotos, setHasBoardPhotos] = useState(false);

  // Admins aren't tied to one class, so they pick which group's schedule to view/manage.
  // Students/professors always see their own group, resolved server-side from their profile.
  const [department, setDepartment] = useState<Department | ''>('');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>('');
  const [specialization, setSpecialization] = useState<Specialization | ''>('');
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];
  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];
  const groupChosen = department && academicYear && specialization;

  // Leading "aha moment" hypothesis for a student app: seeing your real timetable in the first
  // session predicts D7 retention. Fires once per view.
  useEffect(() => {
    track(AnalyticsEvent.ScheduleViewed, { role: user?.role ?? 'unknown' });
  }, [user?.role]);

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');
    if (!value || !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      setAcademicYear('');
    }
  }

  const reload = useCallback(() => {
    if (isAdmin && !groupChosen) {
      setEntries([]);
      setErrored(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrored(false);
    const query = isAdmin ? `?department=${department}&academicYear=${academicYear}&specialization=${specialization}` : '';
    api
      .get<ScheduleEntry[]>(`/schedule${query}`)
      .then((data) => {
        setEntries(data);
        setErrored(false);
      })
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [isAdmin, groupChosen, department, academicYear, specialization]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Keep the "الآن / التالية" banner + the grid's now-line live without a re-fetch.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = today !== 5 && nowMinutes >= GRID_START_HOUR * 60 && nowMinutes < GRID_END_HOUR * 60;
  // Mobile list starts from today, then wraps -- "today, then the rest of the week".
  const todayIdx = Math.max(0, WEEK_DAYS.findIndex((d) => d.value === today));
  const orderedDays = [...WEEK_DAYS.slice(todayIdx), ...WEEK_DAYS.slice(0, todayIdx)];

  const entriesByDay = useMemo(() => {
    const map = new Map<number, ScheduleEntry[]>();
    for (const day of WEEK_DAYS) map.set(day.value, []);
    for (const entry of entries) map.get(entry.dayOfWeek)?.push(entry);
    return map;
  }, [entries]);

  function openCreate() {
    if (!groupChosen) return;
    setEditingEntry(undefined);
    setModalOpen(true);
  }

  // Admins tap an entry to edit it; students/professors tap it to view the details (day/time/
  // location/description/photo an admin or professor may have attached) -- see the Modal below.
  function openEntry(entry: ScheduleEntry) {
    setEditingEntry(entry);
    setModalOpen(true);
  }

  function handleSaved(saved: ScheduleEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e._id === saved._id);
      return exists ? prev.map((e) => (e._id === saved._id ? saved : e)) : [...prev, saved];
    });
  }

  function handleDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e._id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">الجدول الدراسي</h1>
        {isAdmin && groupChosen && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            إضافة محاضرة
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <select value={department} onChange={(e) => handleDepartmentChange(e.target.value as Department | '')} className={SELECT_CLASS}>
            <option value="">اختر القسم</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </select>
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value as AcademicYear | '')}
            disabled={!department}
            className={SELECT_CLASS}
          >
            <option value="">{department ? 'اختر السنة' : 'اختر القسم أولًا'}</option>
            {academicYearOptions.map((y) => (
              <option key={y} value={y}>
                {ACADEMIC_YEAR_LABELS[y]}
              </option>
            ))}
          </select>
          <select
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value as Specialization | '')}
            disabled={!department}
            className={SELECT_CLASS}
          >
            <option value="">{department ? 'اختر التخصص' : 'اختر القسم أولًا'}</option>
            {specializationOptions.map((s) => (
              <option key={s} value={s}>
                {SPECIALIZATION_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {(!isAdmin || groupChosen) && (
        <ScheduleBoardPhoto
          group={
            isAdmin && groupChosen
              ? { department: department as Department, academicYear: academicYear as AcademicYear, specialization: specialization as Specialization }
              : undefined
          }
          canManage={isAdmin}
          onCountChange={(n) => setHasBoardPhotos(n > 0)}
        />
      )}

      {!loading && !errored && entries.length > 0 && (!isAdmin || groupChosen) && (
        <NextClassBanner entries={entries} now={now} />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : errored ? (
        <LoadError title="تعذّر تحميل الجدول" onRetry={reload} retrying={loading} />
      ) : isAdmin && !groupChosen ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CalendarDays className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-foreground">اختر القسم والسنة الدراسية والتخصص لعرض الجدول وتعديله</p>
        </div>
      ) : entries.length === 0 ? (
        // For a student/professor, a whole-timetable photo (ScheduleBoardPhoto above) already
        // satisfies "has a schedule been published" -- showing "لم يُنشر جدول دراسي بعد" underneath
        // it would flatly contradict the photo they can already see, so this empty state is skipped
        // when one exists. Admins always see it (it's entry-specific -- "no lectures added" -- and
        // still true/actionable regardless of whether a photo was also published).
        !isAdmin && hasBoardPhotos ? null : (
          <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <CalendarDays className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {isAdmin ? 'لم يتم نشر أي محاضرات لهذه الفئة بعد' : 'لم يُنشر جدول دراسي لفئتك بعد'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? 'أضف أول محاضرة لهذا القسم والسنة والتخصص.' : 'سيظهر هنا الجدول الدراسي بمجرد نشره من إدارة الكلية.'}
              </p>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                إضافة محاضرة
              </Button>
            )}
          </div>
        )
      ) : (
        <>
          {/* Desktop/tablet grid */}
          <Card className="hidden overflow-x-auto p-4 sm:block">
            <div className="flex min-w-[720px]">
              <div className="w-12 shrink-0">
                <div className="h-8" />
                {HOURS.map((hour) => (
                  <div key={hour} className="relative text-end" style={{ height: HOUR_HEIGHT }}>
                    <span className="absolute -top-2 end-1 text-[10px] text-muted-foreground">{formatHour(hour)}</span>
                  </div>
                ))}
              </div>
              {WEEK_DAYS.map((day) => (
                <div key={day.value} className="min-w-0 flex-1 border-s border-border">
                  <div
                    className={cn(
                      'flex h-8 items-center justify-center text-xs font-semibold',
                      day.value === today ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {day.short}
                  </div>
                  <div className="relative" style={{ height: HOUR_HEIGHT * HOURS.length }}>
                    {HOURS.map((hour) => (
                      <div key={hour} className="border-t border-border" style={{ height: HOUR_HEIGHT }} />
                    ))}
                    {day.value === today && <div className="absolute inset-0 bg-accent/5" />}
                    {day.value === today && showNowLine && (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                        style={{ top: (nowMinutes - GRID_START_HOUR * 60) * (HOUR_HEIGHT / 60) }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                        <span className="h-px flex-1 bg-danger" />
                      </div>
                    )}
                    {(entriesByDay.get(day.value) ?? []).map((entry) => {
                      const top = (toMinutes(entry.startTime) - GRID_START_HOUR * 60) * (HOUR_HEIGHT / 60);
                      const height = Math.max((toMinutes(entry.endTime) - toMinutes(entry.startTime)) * (HOUR_HEIGHT / 60), 28);
                      return (
                        <button
                          key={entry._id}
                          type="button"
                          onClick={() => openEntry(entry)}
                          className={cn(
                            'absolute inset-x-0.5 overflow-hidden rounded-lg border px-1.5 py-1 text-start text-[11px] leading-tight shadow-sm transition-transform hover:z-10 hover:scale-[1.02]',
                            courseColor(entry.courseName),
                          )}
                          style={{ top, height }}
                        >
                          <p className="truncate font-semibold">{entry.courseName}</p>
                          <p className="truncate opacity-80">
                            {entry.startTime} - {entry.endTime}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Mobile fallback -- today first, then the rest of the week */}
          <div className="space-y-4 sm:hidden">
            {orderedDays.map((day) => {
              const dayEntries = entriesByDay.get(day.value) ?? [];
              if (dayEntries.length === 0) return null;
              return (
                <div key={day.value}>
                  <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', day.value === today ? 'text-accent' : 'text-muted-foreground')}>
                    {day.label}
                    {day.value === today && (
                      <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">اليوم</span>
                    )}
                  </h2>
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <Card
                        key={entry._id}
                        className="flex cursor-pointer items-center gap-3 p-4"
                        onClick={() => openEntry(entry)}
                      >
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', courseColor(entry.courseName))}>
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{entry.courseName}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.startTime} - {entry.endTime}
                            {entry.location && (
                              <span className="ms-2 inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {entry.location}
                              </span>
                            )}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isAdmin ? (editingEntry ? 'تعديل الحصة' : 'إضافة محاضرة') : (editingEntry?.courseName ?? '')}
      >
        {isAdmin ? (
          <ScheduleEntryForm
            entry={editingEntry}
            defaultDepartment={department || undefined}
            defaultAcademicYear={academicYear || undefined}
            defaultSpecialization={specialization || undefined}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onClose={() => setModalOpen(false)}
          />
        ) : (
          editingEntry && <ScheduleEntryDetails entry={editingEntry} />
        )}
      </Modal>
    </div>
  );
}
