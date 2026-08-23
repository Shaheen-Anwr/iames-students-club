'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { UploadResult } from '@/lib/types';

export function CoverPhotoUploader({
  coverPhotoUrl,
  onUploaded,
}: {
  coverPhotoUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

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
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute bottom-3 end-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white shadow-soft transition-transform hover:scale-110 hover:opacity-90 active:scale-95"
      >
        {uploading ? <Spinner className="h-4 w-4 text-white" /> : <Camera className="h-4 w-4" />}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}
