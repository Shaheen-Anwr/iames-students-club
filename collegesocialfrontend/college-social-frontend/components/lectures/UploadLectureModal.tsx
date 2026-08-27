'use client';

import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
  const [uploadPercent, setUploadPercent] = useState(0);

  const specializationOptions = department ? SPECIALIZATIONS_BY_DEPARTMENT[department] : [];
  const academicYearOptions = department ? getAcademicYearsForDepartment(department) : [];

  function reset() {
    setCaption('');
    setCourseCode(lockedCourseCode ?? '');
    setDepartment(user?.department ?? '');
    setAcademicYear('');
    setSpecialization('');
    setFile(null);
    setUploadPercent(0);
  }

  function handleClose() {
    if (submitting) return; // avoid orphaning an in-flight upload if the user closes mid-transfer
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
    setUploadPercent(0);
    try {
      const uploaded = await api.upload<UploadResult>(`/upload/${attachmentType}`, file, setUploadPercent);
      const post = await api.post<Post>('/posts', {
        caption: caption.trim(),
        attachmentType,
        attachmentUrl: uploaded.url,
        attachmentOriginalName: file.name,
        attachmentSize: file.size,
        attachmentChunkCount: uploaded.chunkCount,
        courseCode: courseCode.trim() || undefined,
        department: department || undefined,
        academicYear: academicYear || undefined,
        specialization: specialization || undefined,
        scope: 'public',
      });
      onUploaded(post);
      // handleClose() no-ops while submitting (see its guard) -- flip the flag first, then close.
      setSubmitting(false);
      reset();
      onClose();
      showToast('تم رفع الملف بنجاح.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الملف.', 'error');
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border py-7 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-5 w-5" />
          {file ? 'تغيير الملف' : 'اضغط لاختيار ملف أو اسحبه هنا'}
        </button>
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFileChange} disabled={submitting} />

        {file && (
          <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground">
            <span className="truncate">
              {file.name} · {formatBytes(file.size)}
            </span>
            {!submitting && (
              <button type="button" onClick={() => setFile(null)} className="ms-auto text-muted-foreground hover:text-accent">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {submitting && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar percent={uploadPercent} />
            <span className="text-center text-xs text-muted-foreground">
              {uploadPercent < 100 ? `جاري الرفع… ${uploadPercent}%` : 'جاري المعالجة…'}
            </span>
          </div>
        )}

        <Input placeholder="عنوان (اختياري)" value={caption} onChange={(e) => setCaption(e.target.value)} disabled={submitting} />
        {lockedCourseCode ? (
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
            المجلد: <span className="font-medium text-foreground">{lockedCourseCode}</span>
          </div>
        ) : (
          <Input
            placeholder="رمز المقرر (اختياري)، مثل CS101"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            disabled={submitting}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <select
            value={department}
            onChange={(e) => handleDepartmentChange(e.target.value as Department | '')}
            disabled={submitting}
            className={SELECT_CLASS}
          >
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
            disabled={!department || submitting}
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
          disabled={!department || submitting}
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
