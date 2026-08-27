'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { ScheduleEntry } from '@/lib/types';
import { WEEK_DAYS, courseColor } from '@/lib/schedule-week';
import { ScheduleEntryForm } from './ScheduleEntryForm';

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

export function ScheduleGrid() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | undefined>(undefined);

  // Admins aren't tied to one class, so they pick which group's schedule to view/manage.
  // Students/professors always see their own group, resolved server-side from their profile.
  const [department, setDepartment] = useState<Department | ''>('');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>('');
  const [specialization, setSpecialization] = useState<Specialization | ''>('');
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];
  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];
  const groupChosen = department && academicYear && specialization;

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');
    if (!value || !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      setAcademicYear('');
    }
  }

  useEffect(() => {
    if (isAdmin && !groupChosen) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = isAdmin ? `?department=${department}&academicYear=${academicYear}&specialization=${specialization}` : '';
    api
      .get<ScheduleEntry[]>(`/schedule${query}`)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [isAdmin, groupChosen, department, academicYear, specialization]);

  const today = new Date().getDay();

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

  function openEdit(entry: ScheduleEntry) {
    if (!isAdmin) return;
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isAdmin && !groupChosen ? (
        <div className="flex flex-col items-center gap-3 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
            <CalendarDays className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-foreground">اختر القسم والسنة الدراسية والتخصص لعرض الجدول وتعديله</p>
        </div>
      ) : entries.length === 0 ? (
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
                    {(entriesByDay.get(day.value) ?? []).map((entry) => {
                      const top = (toMinutes(entry.startTime) - GRID_START_HOUR * 60) * (HOUR_HEIGHT / 60);
                      const height = Math.max((toMinutes(entry.endTime) - toMinutes(entry.startTime)) * (HOUR_HEIGHT / 60), 28);
                      return (
                        <button
                          key={entry._id}
                          type="button"
                          onClick={() => openEdit(entry)}
                          disabled={!isAdmin}
                          className={cn(
                            'absolute inset-x-0.5 overflow-hidden rounded-lg border px-1.5 py-1 text-start text-[11px] leading-tight shadow-sm transition-transform',
                            isAdmin ? 'hover:z-10 hover:scale-[1.02]' : 'cursor-default',
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

          {/* Mobile fallback */}
          <div className="space-y-4 sm:hidden">
            {WEEK_DAYS.map((day) => {
              const dayEntries = entriesByDay.get(day.value) ?? [];
              if (dayEntries.length === 0) return null;
              return (
                <div key={day.value}>
                  <h2 className={cn('mb-2 text-sm font-semibold', day.value === today ? 'text-accent' : 'text-muted-foreground')}>
                    {day.label}
                  </h2>
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <Card
                        key={entry._id}
                        className={cn('flex items-center gap-3 p-4', isAdmin && 'cursor-pointer')}
                        onClick={isAdmin ? () => openEdit(entry) : undefined}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingEntry ? 'تعديل الحصة' : 'إضافة محاضرة'}>
        <ScheduleEntryForm
          entry={editingEntry}
          defaultDepartment={department || undefined}
          defaultAcademicYear={academicYear || undefined}
          defaultSpecialization={specialization || undefined}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
