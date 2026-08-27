'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { LectureFolder, PostAttachmentType } from '@/lib/types';

export function CreateFolderModal({
  open,
  onClose,
  onSaved,
  attachmentType,
  folder,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (folder: LectureFolder) => void;
  attachmentType: Extract<PostAttachmentType, 'lecture' | 'video'>;
  // When set, the modal renames this existing folder instead of creating a new one.
  folder?: LectureFolder | null;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isEditing = Boolean(folder?.id);

  // Re-seed the field with the folder's current name every time the modal opens for editing, and
  // clear it for a fresh create -- open/folder both change together from the grid's action handlers.
  useEffect(() => {
    if (open) setName(folder?.name ?? '');
  }, [open, folder]);

  function handleClose() {
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const saved =
        isEditing && folder?.id
          ? await api.patch<LectureFolder>(`/posts/lectures/folders/${folder.id}`, { name: name.trim() })
          : await api.post<LectureFolder>('/posts/lectures/folders', { name: name.trim(), type: attachmentType });
      onSaved(saved);
      handleClose();
      showToast(isEditing ? 'تم تحديث المجلد بنجاح.' : 'تم إنشاء المجلد بنجاح.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : isEditing ? 'تعذّر تحديث المجلد.' : 'تعذّر إنشاء المجلد.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={isEditing ? 'إعادة تسمية المجلد' : 'مجلد جديد'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input autoFocus placeholder="اسم المادة، مثل CS101" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={submitting} disabled={!name.trim()}>
          {isEditing ? 'حفظ' : 'إنشاء'}
        </Button>
      </form>
    </Modal>
  );
}
