'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Switch } from '@/components/ui/Switch';
import { ViewablePhoto } from '@/components/ui/ViewablePhoto';
import { api, ApiError } from '@/lib/api';
import { useRawQuery } from '@/lib/query';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
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
// via ScheduleEntryForm -- a group can hold any number of these (one per term, several pages of
// the same table, ...), shown above the per-day grid in ScheduleGrid.tsx. Self-fetching: pass
// `group` when browsing a specific group as admin, omit it to resolve the caller's own group
// (student/professor), same split GET /schedule itself uses. `canManage` gates adding/editing --
// showing/hiding an existing photo is a Switch, not a trash-icon delete button (the photo itself
// is the "replace" affordance: tap it to swap the image, same as the initial-upload tile).
export function ScheduleBoardPhoto({ group, canManage }: { group?: Group; canManage: boolean }) {
  const { showToast } = useToast();
  const queryKey = group
    ? ['schedule-boards', group.department, group.academicYear, group.specialization, canManage]
    : ['schedule-boards', 'me', canManage];
  const queryPath = (() => {
    const params = new URLSearchParams();
    if (group) {
      params.set('department', group.department);
      params.set('academicYear', group.academicYear);
      params.set('specialization', group.specialization);
    }
    if (canManage) params.set('includeInactive', 'true');
    const qs = params.toString();
    return `/schedule/board${qs ? `?${qs}` : ''}`;
  })();
  const { data, isPending } = useRawQuery<ScheduleBoard[]>(queryKey, queryPath);
  const [boards, setBoards] = useState<ScheduleBoard[]>([]);

  useEffect(() => {
    if (data) setBoards(data);
  }, [data]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleBoard | null>(null); // null while adding a new one
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [description, setDescription] = useState('');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function openAdd() {
    setEditing(null);
    setPhoto(null);
    setDescription('');
    setModalOpen(true);
  }

  function openEdit(board: ScheduleBoard) {
    setEditing(board);
    setPhoto(null);
    setDescription(board.description ?? '');
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
    if (!group) return;
    if (!photo && !editing) {
      showToast('اختر صورة الجدول أولًا.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        setUploadPercent(0);
        const { images } = await api.uploadMany<{ images: string[] }>('/upload/post-images', [photo.file], setUploadPercent);
        photoUrl = images[0];
      }
      if (editing) {
        const saved = await api.patch<ScheduleBoard>(`/schedule/board/${editing._id}`, {
          photoUrl,
          description: description.trim() || undefined,
        });
        setBoards((prev) => prev.map((b) => (b._id === saved._id ? saved : b)));
        showToast('تم تحديث الصورة.');
      } else {
        const saved = await api.post<ScheduleBoard>('/schedule/board', {
          ...group,
          photoUrl,
          description: description.trim() || undefined,
        });
        setBoards((prev) => [...prev, saved]);
        showToast('تم نشر صورة الجدول.');
      }
      setModalOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الصورة.', 'error');
    } finally {
      setSubmitting(false);
      setUploadPercent(null);
    }
  }

  async function toggleActive(board: ScheduleBoard, active: boolean) {
    const prev = boards;
    setBoards((bs) => bs.map((b) => (b._id === board._id ? { ...b, active } : b)));
    try {
      const saved = await api.patch<ScheduleBoard>(`/schedule/board/${board._id}`, { active });
      setBoards((bs) => bs.map((b) => (b._id === saved._id ? saved : b)));
    } catch (err) {
      setBoards(prev); // roll back
      showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث الحالة.', 'error');
    }
  }

  if (isPending) return null;
  if (boards.length === 0 && !canManage) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {boards.map((board) => (
          <div
            key={board._id}
            className={cn(
              'relative aspect-video overflow-hidden rounded-xl2 bg-surface-2 ring-1 ring-inset ring-border/50',
              !board.active && 'opacity-40',
            )}
          >
            {canManage ? (
              <button type="button" onClick={() => openEdit(board)} className="block h-full w-full">
                <img src={board.photoUrl} alt="صورة الجدول الدراسي" className="h-full w-full object-cover" />
              </button>
            ) : (
              <ViewablePhoto src={board.photoUrl} alt="صورة الجدول الدراسي" className="block h-full w-full cursor-zoom-in">
                <img src={board.photoUrl} alt="صورة الجدول الدراسي" className="h-full w-full object-cover" />
              </ViewablePhoto>
            )}
            {canManage && (
              <div className="absolute end-1.5 top-1.5 rounded-full bg-black/60 p-1">
                <Switch checked={board.active} onCheckedChange={(v) => toggleActive(board, v)} aria-label="إظهار صورة الجدول" />
              </div>
            )}
          </div>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl2 border border-dashed border-border text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">إضافة صورة</span>
          </button>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل صورة الجدول' : 'إضافة صورة الجدول'}>
        <div className="space-y-4">
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
          {photo || editing ? (
            <div className="group relative aspect-video w-full overflow-hidden rounded-xl2 bg-surface-2 ring-1 ring-inset ring-border/50">
              <img src={photo?.previewUrl ?? editing?.photoUrl ?? ''} alt="" className="h-full w-full object-cover" />
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
            {editing ? 'حفظ التعديلات' : 'نشر الصورة'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
