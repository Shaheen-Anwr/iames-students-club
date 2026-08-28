'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compress-image';
import { useGroups } from '@/lib/groups-context';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { GroupVisibility, StudyGroup } from '@/lib/types';

export function GroupSettingsModal({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group: StudyGroup;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { updateGroup, removeGroup } = useGroups();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-sync the form to the latest group data each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setDescription(group.description ?? '');
    setVisibility(group.visibility);
    setConfirmDelete(false);
  }, [open, group]);

  const dirty =
    name.trim() !== group.name ||
    description.trim() !== (group.description ?? '') ||
    visibility !== group.visibility;

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dirty) return;
    setSaving(true);
    try {
      const updated = await api.patch<StudyGroup>(`/groups/${group._id}`, {
        name: name.trim(),
        description: description.trim(),
        visibility,
      });
      updateGroup(updated);
      showToast('تم حفظ تغييرات المجموعة', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ التغييرات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const img = await compressImage(file, { maxEdge: 1024 });
      const updated = await api.upload<StudyGroup>(`/groups/${group._id}/photo`, img);
      updateGroup(updated);
      showToast('تم تحديث صورة المجموعة', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الصورة', 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true);
    try {
      const updated = await api.delete<StudyGroup>(`/groups/${group._id}/photo`);
      updateGroup(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إزالة الصورة', 'error');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/groups/${group._id}`);
      removeGroup(group._id);
      onClose();
      router.push('/groups');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف المجموعة', 'error');
      setDeleting(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="إعدادات المجموعة">
        <form onSubmit={handleSaveInfo} className="flex flex-col gap-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              {group.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.photoUrl}
                  alt=""
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-accent text-xl font-bold text-white">
                  {group.name.trim().slice(0, 1) || '؟'}
                </div>
              )}
              {photoBusy && (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                {group.photoUrl ? 'تغيير الصورة' : 'إضافة صورة'}
              </Button>
              {group.photoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-danger hover:bg-danger/10"
                  disabled={photoBusy}
                  onClick={handleRemovePhoto}
                >
                  إزالة
                </Button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePickPhoto} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">اسم المجموعة</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الوصف</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="وصف مختصر (اختياري)"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الخصوصية</label>
            <div className="flex gap-1 rounded-full bg-surface-2 p-1">
              {(['private', 'public'] as GroupVisibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={cn(
                    'flex-1 rounded-full py-1.5 text-xs font-medium transition-colors',
                    visibility === v
                      ? 'bg-surface text-foreground shadow-soft'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'private' ? 'خاصة (رمز دعوة)' : 'عامة (قابلة للاكتشاف)'}
                </button>
              ))}
            </div>
            {visibility !== group.visibility && (
              <p className="mt-1.5 text-[11px] text-warning">
                {visibility === 'public'
                  ? 'سيتم إلغاء رمز الدعوة الحالي وستصبح المجموعة ظاهرة للجميع.'
                  : 'سيتم إنشاء رمز دعوة جديد ولن تظهر المجموعة في الاكتشاف.'}
              </p>
            )}
          </div>

          <Button type="submit" loading={saving} disabled={!name.trim() || !dirty} className="rounded-full">
            حفظ التغييرات
          </Button>
        </form>

        {/* Danger zone */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">منطقة الخطر</p>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl2 border border-danger/30 bg-danger/5 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">حذف المجموعة</p>
              <p className="text-xs text-muted-foreground">تُحذف كل القنوات والرسائل نهائيًا. لا يمكن التراجع.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="shrink-0 rounded-full"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="حذف المجموعة"
        message={`سيتم حذف "${group.name}" وكل قنواتها ورسائلها نهائيًا. هل أنت متأكد؟`}
        confirmLabel="نعم، احذف"
      />
    </>
  );
}
