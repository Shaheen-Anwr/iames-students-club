'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { LectureFolder, PostAttachmentType } from '@/lib/types';

export function CreateFolderModal({
  open,
  onClose,
  onCreated,
  attachmentType,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (folder: LectureFolder) => void;
  attachmentType: Extract<PostAttachmentType, 'lecture' | 'video'>;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    setName('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const folder = await api.post<LectureFolder>('/posts/lectures/folders', { name: name.trim(), type: attachmentType });
      onCreated(folder);
      handleClose();
      showToast('تم إنشاء المجلد بنجاح.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إنشاء المجلد.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="مجلد جديد">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          autoFocus
          placeholder="اسم المادة، مثل CS101"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" loading={submitting} disabled={!name.trim()}>
          إنشاء
        </Button>
      </form>
    </Modal>
  );
}
