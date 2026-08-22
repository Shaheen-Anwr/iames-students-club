'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
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
      const result = await api.upload<UploadResult>('/upload/photo', file);
      onUploaded(result.url);
      showToast('تم تحديث الصورة الشخصية.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر رفع الصورة.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative">
      <Avatar src={photoUrl} name={name} size="xl" ring className="border-4 border-surface" />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute bottom-0 end-0 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-soft transition-transform hover:scale-110 hover:opacity-90 active:scale-95"
      >
        {uploading ? <Spinner className="h-4 w-4 text-white" /> : <Camera className="h-4 w-4" />}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}
