'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
  const [description, setDescription] = useState(entry?.description ?? '');
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(entry?.photoUrl ?? null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setExistingPhotoUrl(null);
  }

  function removePhoto() {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setExistingPhotoUrl(null);
  }

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
      // Photo of the timetable/board is optional -- upload it first (same endpoint the
      // marketplace/feed composer use) and include the resulting URL in the create/edit body,
      // rather than a dedicated :id/photo route.
      let photoUrl: string | undefined;
      if (photo) {
        setUploadPercent(0);
        const { images } = await api.uploadMany<{ images: string[] }>('/upload/post-images', [photo.file], setUploadPercent);
        photoUrl = images[0];
      } else if (entry && existingPhotoUrl === null && entry.photoUrl) {
        // User removed the previously-saved photo without picking a new one.
        photoUrl = '';
      }

      const payload = {
        department,
        academicYear,
        specialization,
        dayOfWeek,
        courseName: courseName.trim(),
        startTime,
        endTime,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        photoUrl,
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
      setUploadPercent(null);
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

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">وصف (اختياري)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="ملاحظات إضافية عن الحصة..."
          className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">صورة الجدول (اختياري)</label>
        <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
        {photo || existingPhotoUrl ? (
          <div className="group relative aspect-video w-full overflow-hidden rounded-xl2 bg-surface-2 ring-1 ring-inset ring-border/50">
            <img src={photo?.previewUrl ?? existingPhotoUrl ?? ''} alt="" className="h-full w-full object-cover" />
            {!submitting && (
              <button
                type="button"
                onClick={removePhoto}
                className="absolute end-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl2 border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">أضف صورة للجدول</span>
          </button>
        )}
        {uploadPercent !== null && <ProgressBar percent={uploadPercent} />}
      </div>

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
