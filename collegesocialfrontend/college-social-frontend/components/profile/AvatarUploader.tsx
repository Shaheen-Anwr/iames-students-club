'use client';

import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { UploadResult } from '@/lib/types';

export function AvatarUploader({
  photoUrl,
  name,
  onUploaded,
}: {
  photoUrl?: string | null;
  name: string;
  onUploaded: (url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);

    try {
      const result = await api.upload<UploadResult>('/upload/photo', file);
      onUploaded(result.url);
      showToast('تم تحديث الصورة الشخصية.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الصورة.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete('/upload/photo');
      onUploaded(null);
      showToast('تم حذف الصورة الشخصية.');
      setConfirmOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الصورة.', 'error');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="group relative">
      <Avatar
        src={photoUrl}
        name={name}
        size="xl"
        ring
        viewable
        className="border-4 border-surface transition-opacity group-hover:opacity-90"
      />
      <div className="absolute bottom-0 end-0">
        <Dropdown
          align="end"
          placement="top"
          trigger={
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-soft ring-2 ring-surface transition-transform hover:scale-110 hover:opacity-90 active:scale-95">
              {uploading || removing ? <Spinner className="h-4 w-4 text-white" /> : <Camera className="h-4 w-4" />}
            </span>
          }
          items={[
            { label: 'رفع صورة جديدة', icon: Camera, onClick: () => fileInputRef.current?.click() },
            ...(photoUrl
              ? [{ label: 'حذف الصورة الشخصية', icon: Trash2, onClick: () => setConfirmOpen(true), destructive: true }]
              : []),
          ]}
        />
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRemove}
        title="حذف الصورة الشخصية"
        message="سيتم حذف صورتك الشخصية الحالية. يمكنك رفع صورة جديدة في أي وقت."
        confirmLabel="حذف"
        loading={removing}
      />
    </div>
  );
}