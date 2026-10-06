'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import {
  canvasToFile,
  DEFAULT_STICKER_OPTIONS,
  loadImageFile,
  renderSticker,
  STICKER_SIZE,
  type StickerOptions,
  type StickerShape,
} from '@/lib/sticker-maker';
import { cn } from '@/lib/utils';

const TEXT_COLORS = ['#ffffff', '#FDE047', '#F472B6', '#34D399', '#60A5FA', '#111111'];

// Photo -> sticker: pick a picture, frame it (drag to move, slider/wheel to zoom), choose a shape,
// add a caption, keep the white die-cut outline. Saved to the user's own collection ("ملصقاتي").
export function StickerMaker({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (url: string, sendNow: boolean) => void;
}) {
  const { showToast } = useToast();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [opts, setOpts] = useState<StickerOptions>(DEFAULT_STICKER_OPTIONS);
  const [saving, setSaving] = useState<'save' | 'send' | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => () => releaseRef.current?.(), []);

  // Live preview.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
    ctx.drawImage(renderSticker(image, opts), 0, 0);
  }, [image, opts]);

  const pick = useCallback(
    async (file?: File) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('اختر صورة.', 'error');
        return;
      }
      try {
        const loaded = await loadImageFile(file);
        releaseRef.current?.();
        releaseRef.current = loaded.release;
        setImage(loaded.image);
        setOpts(DEFAULT_STICKER_OPTIONS);
      } catch {
        showToast('تعذّر فتح هذه الصورة.', 'error');
      }
    },
    [showToast],
  );

  const set = <K extends keyof StickerOptions>(key: K, value: StickerOptions[K]) => setOpts((o) => ({ ...o, [key]: value }));

  // Drag to reposition (screen px -> canvas px).
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: opts.offsetX, oy: opts.offsetY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const scale = STICKER_SIZE / e.currentTarget.getBoundingClientRect().width;
    setOpts((o) => ({
      ...o,
      offsetX: drag.current!.ox + (e.clientX - drag.current!.x) * scale,
      offsetY: drag.current!.oy + (e.clientY - drag.current!.y) * scale,
    }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function save(sendNow: boolean) {
    if (!image || saving) return;
    setSaving(sendNow ? 'send' : 'save');
    try {
      const file = await canvasToFile(renderSticker(image, opts));
      const { url } = await api.upload<{ url: string }>('/upload/sticker', file);
      await api.post('/users/me/stickers', { url });
      onCreated(url, sendNow);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حفظ الملصق.', 'error');
    } finally {
      setSaving(null);
    }
  }

  if (!image) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          اختر صورة — صورتك، صورة صاحبك، لقطة من محاضرة — وحوّلها لملصق بحدود بيضاء ونص من اختيارك.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/[0.06] py-6 text-sm font-semibold text-accent hover:bg-accent/10"
          >
            <ImagePlus className="h-7 w-7" /> من الصور
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2/60 py-6 text-sm font-semibold text-muted-foreground hover:text-accent"
          >
            <Camera className="h-7 w-7" /> الكاميرا
          </button>
        </div>
        <Button variant="ghost" fullWidth onClick={onCancel}>
          رجوع للملصقات
        </Button>
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <canvas
          ref={previewRef}
          width={STICKER_SIZE}
          height={STICKER_SIZE}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => set('zoom', Math.min(3, Math.max(0.5, opts.zoom - e.deltaY * 0.0015)))}
          aria-label="معاينة الملصق — اسحب لتحريك الصورة"
          className="aspect-square w-[min(16rem,68vw)] cursor-grab touch-none rounded-2xl bg-[length:20px_20px] [background-image:conic-gradient(rgb(var(--surface-3))_25%,transparent_0_50%,rgb(var(--surface-3))_0_75%,transparent_0)] active:cursor-grabbing"
        />
      </div>

      <Segmented<StickerShape>
        fullWidth
        size="sm"
        value={opts.shape}
        onChange={(v) => setOpts((o) => ({ ...o, shape: v, offsetX: 0, offsetY: 0, zoom: 1 }))}
        options={[
          { value: 'rounded', label: 'مربع' },
          { value: 'circle', label: 'دائرة' },
          { value: 'free', label: 'بدون قص' },
        ]}
      />

      <label className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        تكبير
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.01}
          value={opts.zoom}
          onChange={(e) => set('zoom', Number(e.target.value))}
          className="h-1.5 flex-1 accent-[rgb(var(--accent))]"
        />
      </label>

      <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
        <span className="text-sm font-medium text-foreground">حدود بيضاء</span>
        <Switch checked={opts.outline} onCheckedChange={(v) => set('outline', v)} aria-label="حدود بيضاء" />
      </div>

      <div className="space-y-2 rounded-xl bg-surface-2 p-3">
        <input
          value={opts.text}
          onChange={(e) => set('text', e.target.value)}
          maxLength={24}
          dir="auto"
          placeholder="نص على الملصق (اختياري)"
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {opts.text.trim() && (
          <div className="flex items-center gap-2">
            <Segmented<'top' | 'bottom'>
              size="sm"
              value={opts.textPosition}
              onChange={(v) => set('textPosition', v)}
              options={[
                { value: 'top', label: 'أعلى' },
                { value: 'bottom', label: 'أسفل' },
              ]}
            />
            <div className="ms-auto flex gap-1.5">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`لون النص ${color}`}
                  onClick={() => set('textColor', color)}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-border', opts.textColor === color && 'ring-2 ring-accent')}
                  style={{ background: color }}
                >
                  {opts.textColor === color && <Check className={cn('h-3.5 w-3.5', color === '#111111' ? 'text-white' : 'text-black')} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={!!saving} onClick={() => void save(false)}>
          {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          حفظ في ملصقاتي
        </Button>
        <Button disabled={!!saving} onClick={() => void save(true)}>
          {saving === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
          حفظ وإرسال
        </Button>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => galleryRef.current?.click()}>
          صورة أخرى
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
