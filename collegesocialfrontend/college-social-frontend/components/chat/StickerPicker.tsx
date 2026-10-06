'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ImagePlus, Loader2, Pencil, Search, Star, Type, Upload, Wand2, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { haptic } from '@/lib/haptics';
import { useLongPress } from '@/lib/use-long-press';
import { STICKER_CATALOG } from '@/lib/sticker-catalog';
import { TEXT_STICKERS } from '@/lib/text-stickers';
import { readRecentStickers, rememberSticker, resolveSticker, searchStickers, textStickerRef } from '@/lib/chat-stickers';
import { canvasToFile, DEFAULT_STICKER_OPTIONS, loadImageFile, renderSticker } from '@/lib/sticker-maker';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/types';
import { StickerView } from './StickerView';
import { StickerMaker } from './StickerMaker';

type Tab = 'recent' | 'mine' | 'text' | string;

const TEXT_REFS = TEXT_STICKERS.map(textStickerRef);

// Turn a picked image into a sticker with the default look (fit, white outline) and keep it.
async function quickSticker(file: File): Promise<string> {
  const { image, release } = await loadImageFile(file);
  try {
    const sticker = await canvasToFile(renderSticker(image, { ...DEFAULT_STICKER_OPTIONS, shape: 'free' }));
    const { url } = await api.upload<{ url: string }>('/upload/sticker', sticker);
    await api.post('/users/me/stickers', { url });
    return url;
  } finally {
    release();
  }
}

// The sticker panel: recent, the user's own, Arabic text stickers, and the artwork packs, with
// search across all of them. Tap sends; long-press (or right-click) saves to / removes from
// "ملصقاتي". "صنع ملصق" opens the maker in place (no stacked sheets on mobile).
export function StickerPicker({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (attachment: Attachment) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [view, setView] = useState<'browse' | 'maker'>('browse');
  const [tab, setTab] = useState<Tab>('faces');
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setView('browse');
    setQuery('');
    setEditing(false);
    const r = readRecentStickers();
    setRecent(r);
    setTab(r.length ? 'recent' : 'faces');
    api
      .get<{ stickers: string[] }>('/users/me/stickers')
      .then((res) => setMine(res.stickers))
      .catch(() => undefined);
  }, [open]);

  const send = useCallback(
    async (url: string) => {
      if (sending) return;
      setSending(url);
      try {
        const label = resolveSticker(url).label;
        if (await onSend({ url, type: 'sticker', name: label })) {
          rememberSticker(url);
          haptic('select');
          onClose();
        }
      } finally {
        setSending(null);
      }
    },
    [sending, onSend, onClose],
  );

  const toggleMine = useCallback(
    async (url: string) => {
      const saved = mine.includes(url);
      try {
        const res = saved
          ? await api.delete<{ stickers: string[] }>(`/users/me/stickers?url=${encodeURIComponent(url)}`)
          : await api.post<{ stickers: string[] }>('/users/me/stickers', { url });
        setMine(res.stickers);
        haptic('tap');
        showToast(saved ? 'أُزيل من ملصقاتي.' : 'أُضيف إلى ملصقاتي ⭐');
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'تعذّر تحديث ملصقاتك.', 'error');
      }
    },
    [mine, showToast],
  );

  async function importFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/')).slice(0, 20);
    if (!images.length) return;
    setImporting({ done: 0, total: images.length });
    let added = 0;
    for (const file of images) {
      try {
        await quickSticker(file);
        added += 1;
      } catch {
        /* skip an unreadable/oversized one, keep going */
      }
      setImporting((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setImporting(null);
    const res = await api.get<{ stickers: string[] }>('/users/me/stickers').catch(() => null);
    if (res) setMine(res.stickers);
    setTab('mine');
    showToast(added ? `أُضيف ${added === 1 ? 'ملصق واحد' : `${added} ملصقات`} إلى ملصقاتي.` : 'تعذّر تحويل الصور إلى ملصقات.', added ? 'success' : 'error');
  }

  const results = useMemo(() => searchStickers(query), [query]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = useMemo(
    () => [
      { id: 'recent', label: 'الأخيرة', icon: <Clock className="h-5 w-5" /> },
      { id: 'mine', label: 'ملصقاتي', icon: <Star className="h-5 w-5" /> },
      { id: 'text', label: 'عبارات', icon: <Type className="h-5 w-5" /> },
      ...STICKER_CATALOG.map((pack) => ({
        id: pack.id,
        label: pack.name,
        icon: <StickerView url={pack.items[0].ref} size={26} />,
      })),
    ],
    [],
  );

  const items: string[] = query.trim()
    ? results
    : tab === 'recent'
      ? recent
      : tab === 'mine'
        ? mine
        : tab === 'text'
          ? TEXT_REFS
          : (STICKER_CATALOG.find((p) => p.id === tab)?.items.map((i) => i.ref) ?? []);

  const title = view === 'maker' ? 'صنع ملصق' : 'الملصقات';

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-lg">
      {view === 'maker' ? (
        <StickerMaker
          onCancel={() => setView('browse')}
          onCreated={(url, sendNow) => {
            setMine((prev) => [url, ...prev.filter((u) => u !== url)]);
            if (sendNow) void send(url);
            else {
              setView('browse');
              setTab('mine');
              showToast('تم حفظ الملصق في ملصقاتي ⭐');
            }
          }}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن ملصق: ضحك، قهوة، مبروك…"
              className="h-10 w-full rounded-full bg-surface-2 pe-9 ps-9 text-sm text-foreground ring-1 ring-border/50 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="مسح البحث" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-surface-3">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!query.trim() && (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => {
                    setTab(t.id);
                    setEditing(false);
                  }}
                  className={cn(
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors',
                    tab === t.id ? 'text-accent' : 'hover:bg-surface-2',
                  )}
                >
                  {tab === t.id && (
                    <motion.span layoutId="sticker-tab" className="absolute inset-0 rounded-xl bg-accent/[0.12] ring-1 ring-accent/30" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                  )}
                  <span className="relative">{t.icon}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-1 text-[12px] font-semibold text-muted-foreground">
            <span>{query.trim() ? `نتائج «${query.trim()}»` : tabs.find((t) => t.id === tab)?.label}</span>
            {!query.trim() && tab === 'mine' && mine.length > 0 && (
              <button type="button" onClick={() => setEditing((v) => !v)} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5', editing ? 'bg-accent/10 text-accent' : 'hover:bg-surface-2')}>
                <Pencil className="h-3 w-3" /> {editing ? 'تم' : 'تعديل'}
              </button>
            )}
          </div>

          <div className="h-[44vh] max-h-[26rem] overflow-y-auto overscroll-contain scrollbar-thin">
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {!query.trim() && tab === 'mine' && !editing && (
                <>
                  <button
                    type="button"
                    onClick={() => setView('maker')}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/[0.06] text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10"
                  >
                    <Wand2 className="h-6 w-6" /> صنع ملصق
                  </button>
                  <button
                    type="button"
                    disabled={!!importing}
                    onClick={() => uploadRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface-2/60 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> {importing.done}/{importing.total}
                      </>
                    ) : (
                      <>
                        <Upload className="h-6 w-6" /> من الصور
                      </>
                    )}
                  </button>
                </>
              )}
              {items.map((url) => (
                <StickerCell
                  key={url}
                  url={url}
                  saved={mine.includes(url)}
                  editing={editing && tab === 'mine' && !query.trim()}
                  busy={sending === url}
                  onSend={() => void send(url)}
                  onToggleSave={() => void toggleMine(url)}
                />
              ))}
            </div>

            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                {query.trim() ? (
                  'لا توجد ملصقات بهذا الاسم.'
                ) : tab === 'recent' ? (
                  'الملصقات التي ترسلها تظهر هنا.'
                ) : tab === 'mine' ? (
                  <>
                    <ImagePlus className="h-8 w-8 text-accent" />
                    <span>اصنع ملصقك من أي صورة، أو اضغط مطولًا على أي ملصق لحفظه هنا.</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground">
            اضغط للإرسال · اضغط مطولًا للحفظ في ملصقاتي ·{' '}
            <a href="/stickers/LICENSES.txt" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              رسومات Fluent Emoji وNoto Emoji
            </a>
          </p>

          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void importFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
      )}
    </Modal>
  );
}

function StickerCell({
  url,
  saved,
  editing,
  busy,
  onSend,
  onToggleSave,
}: {
  url: string;
  saved: boolean;
  editing: boolean;
  busy: boolean;
  onSend: () => void;
  onToggleSave: () => void;
}) {
  const { handlers, consumeLongPress } = useLongPress<HTMLButtonElement>(() => {
    haptic('impact');
    onToggleSave();
  });
  return (
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (consumeLongPress()) return;
        if (editing) onToggleSave();
        else onSend();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleSave();
      }}
      aria-label={resolveSticker(url).label}
      className={cn(
        'relative flex aspect-square items-center justify-center rounded-2xl p-1 transition-transform [-webkit-touch-callout:none] hover:bg-surface-2 active:scale-90',
        busy && 'animate-pulse',
      )}
    >
      <StickerView url={url} size={64} />
      {editing && (
        <span className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow-elev-1">
          <X className="h-3 w-3" />
        </span>
      )}
      {!editing && saved && (
        <span className="absolute end-1 top-1 text-[11px] text-amber-400 drop-shadow" aria-hidden>
          ★
        </span>
      )}
    </button>
  );
}
