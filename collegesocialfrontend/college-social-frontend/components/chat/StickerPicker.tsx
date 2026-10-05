'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { api, ApiError } from '@/lib/api';
import { STICKER_PACKS } from '@/lib/chat-stickers';
import { assetUrl } from '@/lib/utils';
import { useToast } from '@/lib/toast-context';
import type { Attachment, UploadResult } from '@/lib/types';

export function StickerPicker({ open, onClose, onSend }: {
  open: boolean;
  onClose: () => void;
  onSend: (attachment: Attachment) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // The personal collection: uploads, plus stickers saved from chats ("حفظ في ملصقاتي").
  useEffect(() => {
    if (!open) return;
    api
      .get<{ stickers: string[] }>('/users/me/stickers')
      .then((r) => setMine(r.stickers.filter((url) => !url.startsWith('sticker:'))))
      .catch(() => undefined);
  }, [open]);

  async function send(attachment: Attachment) {
    setBusy(true);
    try {
      if (await onSend(attachment)) onClose();
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast('اختر صورة PNG أو JPG أو WEBP أو GIF بحجم أقل من 5 ميجابايت.', 'error');
      return;
    }
    setBusy(true);
    try {
      const uploaded = await api.upload<UploadResult>('/upload/file', file);
      // Keep it for next time, then send it.
      void api.post('/users/me/stickers', { url: uploaded.url }).catch(() => undefined);
      await send({ url: uploaded.url, type: 'sticker', name: file.name, size: uploaded.size, mimeType: uploaded.mimeType });
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'تعذّر إرسال الملصق.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="الملصقات">
      <div className="space-y-5">
        {mine.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">ملصقاتي</p>
            <div className="grid grid-cols-4 gap-2">
              {mine.map((url) => (
                <button
                  key={url}
                  type="button"
                  disabled={busy}
                  aria-label="إرسال الملصق"
                  onClick={() => void send({ url, type: 'sticker', name: 'ملصق' })}
                  className="flex aspect-square items-center justify-center rounded-2xl bg-surface-2 p-1.5 transition-transform hover:scale-105 disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(url) ?? ''} alt="" loading="lazy" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          </section>
        )}
        {STICKER_PACKS.map((pack) => (
          <section key={pack.id}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{pack.name}</p>
            <div className="grid grid-cols-3 gap-2">
              {pack.stickers.map((sticker) => (
                <button key={sticker.id} disabled={busy} type="button" title={sticker.label} aria-label={sticker.label}
                  onClick={() => void send({ url: `sticker:${pack.id}/${sticker.id}`, type: 'sticker', name: sticker.label })}
                  className="rounded-2xl bg-surface-2 p-3 text-5xl transition-transform hover:scale-105 disabled:opacity-50">
                  {sticker.emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent/50 p-3 text-sm font-medium text-accent disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          أرسل صورة كملصق
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
    </Modal>
  );
}
