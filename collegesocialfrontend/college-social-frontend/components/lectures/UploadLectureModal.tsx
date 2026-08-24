'use client';

import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from '@/lib/departments';
import { ACADEMIC_YEAR_LABELS, getAcademicYearsForDepartment, type AcademicYear } from '@/lib/academic-years';
import { SPECIALIZATIONS_BY_DEPARTMENT, SPECIALIZATION_LABELS, type Specialization } from '@/lib/specializations';
import { formatBytes } from '@/lib/utils';
import type { Post, PostAttachmentType, UploadResult } from '@/lib/types';

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export function UploadLectureModal({
  open,
  onClose,
  onUploaded,
  attachmentType,
  accept,
  title,
  lockedCourseCode,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (post: Post) => void;
  attachmentType: Extract<PostAttachmentType, 'lecture' | 'video'>;
  accept: string;
  title: string;
  // When set, this upload happens from inside a folder -- the course code is fixed to the folder's
  // name and the field is hidden instead of freely editable.
  lockedCourseCode?: string;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState('');
  const [courseCode, setCourseCode] = useState(lockedCourseCode ?? '');
  const [department, setDepartment] = useState<Department | ''>(user?.department ?? '');
  const [academicYear, setAcademicYear] = useState<AcademicYear | ''>('');
  const [specialization, setSpecialization] = useState<Specialization | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];

  function reset() {
    setCaption('');
    setCourseCode(lockedCourseCode ?? '');
    setDepartment(user?.department ?? '');
    setAcademicYear('');
    setSpecialization('');
    setFile(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
    e.target.value = '';
  }

  function handleDepartmentChange(value: Department | '') {
    setDepartment(value);
    setSpecialization('');
    if (!value || !getAcademicYearsForDepartment(value).includes(academicYear as AcademicYear)) {
      setAcademicYear('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      showToast('اختر ملفًا أولًا.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await api.upload<UploadResult>(`/upload/${attachmentType}`, file);
      const post = await api.post<Post>('/posts', {
        caption: caption.trim(),
        attachmentType,
        attachmentUrl: uploaded.url,
        attachmentOriginalName: file.name,
        courseCode: courseCode.trim() || undefined,
        department: department || undefined,
        academicYear: academicYear || undefined,
        specialization: specialization || undefined,
        scope: 'public',
      });
      onUploaded(post);
      handleClose();
      showToast('تم رفع الملف بنجاح.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-6 text-sm text-muted-foreground hover:border-accent hover:text-accent"
        >
          <Upload className="h-4 w-4" />
          {file ? 'تغيير الملف' : 'اختر ملفًا'}
        </button>
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} />

        {file && (
          <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground">
            <span className="truncate">
              {file.name} · {formatBytes(file.size)}
            </span>
            <button type="button" onClick={() => setFile(null)} className="ms-auto text-muted-foreground hover:text-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Input placeholder="عنوان (اختياري)" value={caption} onChange={(e) => setCaption(e.target.value)} />
        {lockedCourseCode ? (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
            المجلد: <span className="font-medium text-foreground">{lockedCourseCode}</span>
          </div>
        ) : (
          <Input placeholder="رمز المقرر (اختياري)، مثل CS101" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <select value={department} onChange={(e) => handleDepartmentChange(e.target.value as Department | '')} className={SELECT_CLASS}>
            <option value="">كل الشعب</option>
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
            <option value="">{department ? 'كل السنوات' : 'اختر الشعبة أولًا'}</option>
            {academicYearOptions.map((y) => (
              <option key={y} value={y}>
                {ACADEMIC_YEAR_LABELS[y]}
              </option>
            ))}
          </select>
        </div>

        <select
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value as Specialization | '')}
          disabled={!department}
          className={SELECT_CLASS}
        >
          <option value="">{department ? 'كل التخصصات' : 'اختر الشعبة أولًا'}</option>
          {specializationOptions.map((s) => (
            <option key={s} value={s}>
              {SPECIALIZATION_LABELS[s]}
            </option>
          ))}
        </select>

        <Button type="submit" loading={submitting} disabled={!file}>
          رفع
        </Button>
      </form>
    </Modal>
  );
}
