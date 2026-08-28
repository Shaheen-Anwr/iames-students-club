'use client';

import { useRef, useState } from 'react';
import { Film, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useToast } from '@/lib/toast-context';
import { readVideoDuration, MAX_REEL_SECONDS } from '@/lib/video';
import { createReel } from '@/lib/reels';
import { ApiError } from '@/lib/api';
import type { Reel } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (reel: Reel) => void;
}

export function ReelUploadSheet({ open, onClose, onCreated }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setDurationSec(0);
    setCaption('');
    setPercent(0);
    setUploading(false);
    abortRef.current = null;
  }

  function close() {
    if (uploading) return;
    reset();
    onClose();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!picked.type.startsWith('video/')) {
      showToast('اختر ملف فيديو.', 'error');
      return;
    }
    let seconds = 0;
    try {
      seconds = await readVideoDuration(picked);
    } catch {
      showToast('تعذّر قراءة الفيديو، جرّب ملفًا آخر.', 'error');
      return;
    }
    if (seconds > MAX_REEL_SECONDS + 0.5) {
      showToast(`الحد الأقصى لمدة الريلز ${MAX_REEL_SECONDS} ثانية.`, 'error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setDurationSec(seconds);
  }

  async function submit() {
    if (!file || uploading) return;
    setUploading(true);
    setPercent(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reel = await createReel({
        file,
        caption: caption.trim(),
        durationSec: Math.round(durationSec),
        onProgress: setPercent,
        signal: controller.signal,
      });
      showToast('تم نشر الريل!', 'success');
      onCreated(reel);
      reset();
      onClose();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        showToast('تم إلغاء الرفع.', 'info');
      } else {
        showToast(err instanceof ApiError ? err.message : 'تعذّر نشر الريل، حاول مرة أخرى.', 'error');
      }
      setUploading(false);
      setPercent(0);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} title="ريل جديد" className="h-[80vh]">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {!file ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <Film className="h-10 w-10" />
            <span className="text-sm font-medium">اختر فيديو (حتى {MAX_REEL_SECONDS} ثانية)</span>
            <span className="text-xs">سيتم ضغطه ورفعه مباشرةً بأعلى سرعة</span>
          </button>
        ) : (
          <>
            <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-2xl bg-black">
              {previewUrl && (
                <video src={previewUrl} className="h-full w-full object-contain" controls playsInline muted />
              )}
              {!uploading && (
                <button
                  onClick={reset}
                  aria-label="إزالة"
                  className="absolute end-2 top-2 rounded-full bg-black/50 p-1.5 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {Math.round(durationSec)} ثانية
              </span>
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="اكتب وصفًا… استخدم #وسم للتصنيف"
              rows={3}
              maxLength={2000}
              disabled={uploading}
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />

            {uploading && (
              <div className="space-y-1">
                <ProgressBar percent={percent} />
                <p className="text-center text-xs text-muted-foreground">{percent}% — جارٍ الرفع…</p>
              </div>
            )}

            <div className="mt-auto flex gap-2">
              {uploading ? (
                <Button variant="secondary" fullWidth onClick={() => abortRef.current?.abort()}>
                  إلغاء
                </Button>
              ) : (
                <Button fullWidth onClick={submit}>
                  نشر الريل
                </Button>
              )}
            </div>
          </>
        )}
        <input ref={inputRef} type="file" accept="video/*" hidden onChange={onPick} />
      </div>
    </Sheet>
  );
}
