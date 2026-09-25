'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Dropdown } from '@/components/ui/Dropdown';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { UploadResult } from '@/lib/types';

async function cropAvatar(file: File, x: number, y: number): Promise<File> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذّر تجهيز الصورة.');

    context.drawImage(
      image,
      (image.naturalWidth - side) * x,
      (image.naturalHeight - side) * y,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('تعذّر تجهيز الصورة.'))), 'image/jpeg', 0.92);
    });
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
    return new File([blob], `${baseName}-avatar.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [cropDimensions, setCropDimensions] = useState({ width: 0, height: 0 });
  const [cropPosition, setCropPosition] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    return () => {
      if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
    };
  }, [cropPreviewUrl]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCropFile(file);
    setCropDimensions({ width: 0, height: 0 });
    setCropPosition({ x: 0.5, y: 0.5 });
    setCropPreviewUrl(URL.createObjectURL(file));
  }

  async function handleCropAndUpload() {
    if (!cropFile || uploading) return;
    setUploading(true);

    try {
      const croppedFile = await cropAvatar(cropFile, cropPosition.x, cropPosition.y);
      const result = await api.upload<UploadResult>('/upload/photo', croppedFile);
      onUploaded(result.url);
      showToast('تم تحديث الصورة الشخصية.');
      setCropPreviewUrl(null);
      setCropFile(null);
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
        fit="cover"
        className="rounded-2xl border-4 border-surface bg-surface-2 shadow-elev-2 transition-opacity group-hover:opacity-90"
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
      <Modal
        open={Boolean(cropPreviewUrl)}
        onClose={() => {
          if (!uploading) {
            setCropPreviewUrl(null);
            setCropFile(null);
          }
        }}
        title="ضبط الصورة الشخصية"
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">حرّك الصورة لتحديد الجزء الذي سيظهر داخل إطار الصورة الشخصية.</p>
          <div className="mx-auto aspect-square w-56 max-w-full overflow-hidden rounded-2xl border-4 border-surface-2 bg-surface-2 shadow-elev-2">
            {cropPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cropPreviewUrl}
                alt="معاينة قص الصورة الشخصية"
                className="h-full w-full object-cover"
                style={{ objectPosition: `${cropPosition.x * 100}% ${cropPosition.y * 100}%` }}
                onLoad={(event) =>
                  setCropDimensions({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
              />
            )}
          </div>
          {cropDimensions.width > cropDimensions.height && (
            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>تحريك أفقي</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={cropPosition.x}
                onChange={(event) => setCropPosition((position) => ({ ...position, x: Number(event.target.value) }))}
                className="w-full accent-accent"
                dir="ltr"
                aria-label="ضبط القص الأفقي للصورة"
              />
            </label>
          )}
          {cropDimensions.height > cropDimensions.width && (
            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>تحريك عمودي</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={cropPosition.y}
                onChange={(event) => setCropPosition((position) => ({ ...position, y: Number(event.target.value) }))}
                className="w-full accent-accent"
                dir="ltr"
                aria-label="ضبط القص العمودي للصورة"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCropPreviewUrl(null); setCropFile(null); }} disabled={uploading}>
              إلغاء
            </Button>
            <Button onClick={handleCropAndUpload} loading={uploading} disabled={!cropDimensions.width}>
              اعتماد الصورة
            </Button>
          </div>
        </div>
      </Modal>
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