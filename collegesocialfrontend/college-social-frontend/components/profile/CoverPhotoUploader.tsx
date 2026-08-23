'use client';

import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { UploadResult } from '@/lib/types';

export function CoverPhotoUploader({
  coverPhotoUrl,
  onUploaded,
}: {
  coverPhotoUrl?: string | null;
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
      const result = await api.upload<UploadResult>('/upload/cover-photo', file);
      onUploaded(result.url);
      showToast('تم تحديث صورة الغلاف.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع صورة الغلاف.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.delete('/upload/cover-photo');
      onUploaded(null);
      showToast('تم حذف صورة الغلاف.');
      setConfirmOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف صورة الغلاف.', 'error');
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing;

  return (
    <div
      className={cn(
        'group relative h-36 sm:h-48',
        coverPhotoUrl
          ? 'bg-cover bg-center'
          : 'bg-gradient-to-l from-background via-surface-2 to-accent/20',
      )}
      style={coverPhotoUrl ? { backgroundImage: `url(${coverPhotoUrl})` } : undefined}
    >
      {coverPhotoUrl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
      )}
      <div className="absolute bottom-3 end-3">
        {coverPhotoUrl ? (
          <Dropdown
            align="end"
            placement="top"
            trigger={
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60">
                {busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Camera className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">تعديل الغلاف</span>
              </span>
            }
            items={[
              { label: 'رفع صورة جديدة', icon: Camera, onClick: () => fileInputRef.current?.click() },
              { label: 'إزالة صورة الغلاف', icon: Trash2, onClick: () => setConfirmOpen(true), destructive: true },
            ]}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-2 text-xs font-medium text-foreground shadow-soft backdrop-blur-sm transition-colors hover:bg-surface-2"
          >
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
            إضافة صورة غلاف
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRemove}
        title="حذف صورة الغلاف"
        message="سيتم حذف صورة الغلاف الحالية. يمكنك رفع صورة جديدة في أي وقت."
        confirmLabel="حذف"
        loading={removing}
      />
    </div>
  );
}
