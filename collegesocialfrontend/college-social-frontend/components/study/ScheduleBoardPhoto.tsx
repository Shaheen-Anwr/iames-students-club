'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import { api, ApiError } from '@/lib/api';
import { useRawQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import type { Department } from '@/lib/departments';
import type { AcademicYear } from '@/lib/academic-years';
import type { Specialization } from '@/lib/specializations';
import type { ScheduleBoard } from '@/lib/types';

interface Group {
  department: Department;
  academicYear: AcademicYear;
  specialization: Specialization;
}

// The "just upload the whole timetable as one photo" alternative to building it lecture-by-lecture
// via ScheduleEntryForm -- shown above the per-day grid in ScheduleGrid.tsx. Self-fetching: pass
// `group` when browsing a specific group as admin, omit it to resolve the caller's own group
// (student/professor), same split GET /schedule itself uses. `canManage` gates upload/replace/
// delete (admins today, same as the rest of ScheduleGrid's isAdmin gate).
export function ScheduleBoardPhoto({ group, canManage }: { group?: Group; canManage: boolean }) {
  const { showToast } = useToast();
  const queryKey = group
    ? ['schedule-board', group.department, group.academicYear, group.specialization]
    : ['schedule-board', 'me'];
  const queryPath = group
    ? `/schedule/board?department=${group.department}&academicYear=${group.academicYear}&specialization=${group.specialization}`
    : '/schedule/board';
  const { data, isPending } = useRawQuery<ScheduleBoard | null>(queryKey, queryPath);
  const [board, setBoard] = useState<ScheduleBoard | null | undefined>(undefined);

  useEffect(() => {
    if (data !== undefined) setBoard(data);
  }, [data]);

  const [modalOpen, setModalOpen] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [description, setDescription] = useState('');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function openModal() {
    setPhoto(null);
    setDescription(board?.description ?? '');
    setModalOpen(true);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function handleSubmit() {
    if (!group || (!photo && !board)) {
      showToast('اختر صورة الجدول أولًا.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let photoUrl = board?.photoUrl;
      if (photo) {
        setUploadPercent(0);
        const { images } = await api.uploadMany<{ images: string[] }>('/upload/post-images', [photo.file], setUploadPercent);
        photoUrl = images[0];
      }
      const saved = await api.post<ScheduleBoard>('/schedule/board', {
        ...group,
        photoUrl,
        description: description.trim() || undefined,
      });
      setBoard(saved);
      showToast('تم نشر صورة الجدول.');
      setModalOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الصورة.', 'error');
    } finally {
      setSubmitting(false);
      setUploadPercent(null);
    }
  }

  async function handleDelete() {
    if (!group || !confirm('هل تريد حذف صورة الجدول؟')) return;
    setDeleting(true);
    try {
      await api.delete(`/schedule/board?department=${group.department}&academicYear=${group.academicYear}&specialization=${group.specialization}`);
      setBoard(null);
      showToast('تم حذف صورة الجدول.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الصورة.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (isPending || board === undefined) return null;
  if (!board && !canManage) return null;

  return (
    <>
      {board ? (
        <Card className="space-y-3 p-4">
          <ViewablePhoto src={board.photoUrl} alt="صورة الجدول الدراسي" className="block cursor-zoom-in overflow-hidden rounded-xl2">
            <img src={board.photoUrl} alt="صورة الجدول الدراسي" className="max-h-96 w-full object-contain" />
          </ViewablePhoto>
          {board.description && <p className="whitespace-pre-wrap text-sm text-foreground">{board.description}</p>}
          {canManage && (
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={openModal}>
                <Camera className="h-4 w-4" />
                تحديث الصورة
              </Button>
              <Button type="button" size="sm" variant="danger" loading={deleting} onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl2 border border-dashed border-border bg-surface-2/40 py-8 text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
        >
          <ImagePlus className="h-6 w-6" />
          <span className="text-sm font-medium">ارفع صورة الجدول الدراسي بدلًا من إدخاله محاضرة بمحاضرة</span>
        </button>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="صورة الجدول الدراسي">
        <div className="space-y-4">
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
          {photo || board ? (
            <div className="group relative aspect-video w-full overflow-hidden rounded-xl2 bg-surface-2 ring-1 ring-inset ring-border/50">
              <img src={photo?.previewUrl ?? board?.photoUrl ?? ''} alt="" className="h-full w-full object-cover" />
              {!submitting && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute end-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-xl2 border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs">اختر صورة الجدول</span>
            </button>
          )}
          {uploadPercent !== null && <ProgressBar percent={uploadPercent} />}

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="ملاحظات إضافية (اختياري)..."
            className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />

          <Button type="button" fullWidth loading={submitting} onClick={handleSubmit}>
            نشر الصورة
          </Button>
        </div>
      </Modal>
    </>
  );
}
