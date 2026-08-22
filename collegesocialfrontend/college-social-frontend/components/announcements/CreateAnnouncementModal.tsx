'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { Announcement } from '@/lib/types';

export function CreateAnnouncementModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (announcement: Announcement) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle('');
    setBody('');
    setPinned(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const announcement = await api.post<Announcement>('/announcements', { title: title.trim(), body: body.trim(), pinned });
      onCreated(announcement);
      handleClose();
      showToast('تم نشر الإعلان.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر نشر الإعلان', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="نشر إعلان">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input autoFocus placeholder="عنوان الإعلان" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="نص الإعلان..." value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 rounded" />
          تثبيت الإعلان في الأعلى
        </label>
        <Button type="submit" loading={submitting} disabled={!title.trim() || !body.trim()}>
          نشر
        </Button>
      </form>
    </Modal>
  );
}
