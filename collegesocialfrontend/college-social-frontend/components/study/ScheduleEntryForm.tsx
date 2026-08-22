'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import type { ScheduleEntry } from '@/lib/types';

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const WEEK_DAYS: { value: ScheduleEntry['dayOfWeek']; label: string }[] = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

export function ScheduleEntryForm({
  entry,
  defaultDepartment,
  defaultAcademicYear,
  defaultSpecialization,
  onSaved,
  onDeleted,
  onClose,
}: {
  entry?: ScheduleEntry;
  defaultDepartment?: Department;
  defaultAcademicYear?: AcademicYear;
  defaultSpecialization?: Specialization;
  onSaved: (entry: ScheduleEntry) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [department, setDepartment] = useState<Department | ''>((entry?.department as Department) ?? defaultDepartment ?? '');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>(
    (entry?.academicYear as AcademicYear) ?? defaultAcademicYear ?? '',
  );
  const [specialization, setSpecialization] = useState<Specialization | ''>(
    (entry?.specialization as Specialization) ?? defaultSpecialization ?? '',
  );
  const [dayOfWeek, setDayOfWeek] = useState<ScheduleEntry['dayOfWeek']>(entry?.dayOfWeek ?? 0);
  const [courseName, setCourseName] = useState(entry?.courseName ?? '');
  const [startTime, setStartTime] = useState(entry?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(entry?.endTime ?? '10:00');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');
    if (!value || !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      setAcademicYear('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department || !academicYear || !specialization) {
      showToast('اختر القسم والسنة الدراسية والتخصص أولًا.', 'error');
      return;
    }
    if (!courseName.trim()) {
      showToast('اكتب اسم المقرر أولًا.', 'error');
      return;
    }
    if (endTime <= startTime) {
      showToast('وقت الانتهاء يجب أن يكون بعد وقت البدء.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        department,
        academicYear,
        specialization,
        dayOfWeek,
        courseName: courseName.trim(),
        startTime,
        endTime,
        location: location.trim() || undefined,
      };
      const saved = entry
        ? await api.patch<ScheduleEntry>(`/schedule/${entry._id}`, payload)
        : await api.post<ScheduleEntry>('/schedule', payload);
      onSaved(saved);
      showToast(entry ? 'تم تحديث الحصة.' : 'تمت إضافة الحصة إلى الجدول.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الحصة.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!entry || !confirm('هل تريد حذف هذه الحصة من الجدول؟')) return;
    setDeleting(true);
    try {
      await api.delete(`/schedule/${entry._id}`);
      onDeleted?.(entry._id);
      showToast('تم حذف الحصة.');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الحصة.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">القسم</label>
          <select
            value={department}
            onChange={(e) => handleDepartmentChange(e.target.value as Department | '')}
            className={SELECT_CLASS}
          >
            <option value="">اختر القسم</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">السنة الدراسية</label>
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
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">التخصص</label>
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

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">اليوم</label>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value) as ScheduleEntry['dayOfWeek'])}
          className={SELECT_CLASS}
        >
          {WEEK_DAYS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Input label="اسم المقرر" value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="مثال: هياكل البيانات" required />

      <div className="grid grid-cols-2 gap-3">
        <Input label="وقت البدء" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        <Input label="وقت الانتهاء" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
      </div>

      <Input label="القاعة (اختياري)" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثال: مبنى ٢ - قاعة ١٠١" />

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={submitting} className="flex-1">
          {entry ? 'حفظ التعديلات' : 'إضافة الحصة'}
        </Button>
        {entry && (
          <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
            حذف
          </Button>
        )}
      </div>
    </form>
  );
}
