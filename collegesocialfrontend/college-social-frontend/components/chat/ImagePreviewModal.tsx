'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Forward,
  Loader2,
  MessageSquareShare,
  Pencil,
  Reply,
  Share2,
  SmilePlus,
  Star,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cldOptimize } from '@/lib/images';
import { saveBlob } from '@/lib/download';
import { formatFullDate } from '@/lib/chat-helpers';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn } from '@/lib/utils';
import { QUICK_REACTIONS } from './EmojiPicker';

// Shared by ChatWindow (personal chat) and ChannelWindow (group channels). Generic over the
// message shape -- both `Message` and `ChannelMessage` carry the fields used here.
interface PreviewMessage {
  text?: string;
  starredBy?: string[];
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

type GestureMode = 'none' | 'pending' | 'pan' | 'pinch' | 'swipe' | 'dismiss';

// Full-screen photo viewer:
//   zoom   -- pinch, ctrl/trackpad wheel, double-tap / double-click (to the point under the finger)
//   move   -- drag to pan while zoomed (clamped to the photo's edges)
//   browse -- swipe sideways, arrows, ←/→ keys, or the thumbnail strip (albums)
//   close  -- swipe down, Esc, or ✕
// A single tap toggles the chrome for an unobstructed view. Actions work on the whole message.
export function ImagePreviewModal<T extends PreviewMessage>({
  src,
  alt,
  onClose,
  message,
  isOwn,
  onReply,
  onReact,
  onForward,
  onToggleStar,
  onEdit,
  onDelete,
  currentUserId,
  gallery,
  initialIndex = 0,
  senderName,
  senderPhotoUrl,
  createdAt,
  caption,
  onGoToMessage,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  message: T;
  isOwn: boolean;
  onReply: (msg: T) => void;
  onReact: (msg: T, emoji: string) => void;
  onForward?: (msg: T) => void;
  onToggleStar: (msg: T) => void;
  onEdit: (msg: T) => void;
  onDelete: (msg: T, forEveryone: boolean) => void;
  currentUserId: string;
  /** Album mode: every photo of the message. */
  gallery?: { url: string; name: string }[];
  initialIndex?: number;
  senderName?: string;
  senderPhotoUrl?: string | null;
  createdAt?: string;
  caption?: string;
  /** Close the viewer and scroll the chat to this message. */
  onGoToMessage?: () => void;
}) {
  const { showToast } = useToast();
  const photos = gallery?.length ? gallery : [{ url: src, name: alt }];
  const count = photos.length;
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), count - 1));
  const [chrome, setChrome] = useState(true);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [zoomed, setZoomed] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const t = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const natural = useRef<{ w: number; h: number } | null>(null);
  const gesture = useRef<{
    mode: GestureMode;
    pointers: Map<number, { x: number; y: number }>;
    start: { x: number; y: number; time: number; t: Transform; dist: number; mid: { x: number; y: number } };
    lastTap: { time: number; x: number; y: number };
    tapTimer: ReturnType<typeof setTimeout> | null;
  }>({
    mode: 'none',
    pointers: new Map(),
    start: { x: 0, y: 0, time: 0, t: { scale: 1, x: 0, y: 0 }, dist: 0, mid: { x: 0, y: 0 } },
    lastTap: { time: 0, x: 0, y: 0 },
    tapTimer: null,
  });

  const current = photos[index];
  const isStarred = !!message.starredBy?.includes(currentUserId);
  const captionText = (caption ?? message.text ?? '').trim();

  useEffect(() => setMounted(true), []);

  // ---- transform helpers (direct DOM writes while gesturing -- no re-render per frame) ----
  const apply = useCallback((animate = false) => {
    const el = imageRef.current;
    if (!el) return;
    const { scale, x, y } = t.current;
    el.style.transition = animate ? 'transform 260ms cubic-bezier(0.2, 0, 0, 1)' : 'none';
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  const setBackdrop = (opacity: number, animate = false) => {
    const el = backdropRef.current;
    if (!el) return;
    el.style.transition = animate ? 'opacity 260ms ease' : 'none';
    el.style.opacity = String(opacity);
  };

  // How far the photo can move at a scale before showing empty space past its edges.
  const bounds = (scale: number) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const aspect = natural.current ? natural.current.w / natural.current.h : sw / sh;
    const w = Math.min(sw, sh * aspect);
    const h = w / aspect;
    return { x: Math.max(0, (w * scale - sw) / 2), y: Math.max(0, (h * scale - sh) / 2) };
  };

  const clampInto = (next: Transform): Transform => {
    const b = bounds(next.scale);
    return { scale: next.scale, x: Math.min(b.x, Math.max(-b.x, next.x)), y: Math.min(b.y, Math.max(-b.y, next.y)) };
  };

  const reset = useCallback(
    (animate = true) => {
      t.current = { scale: 1, x: 0, y: 0 };
      setZoomed(false);
      apply(animate);
    },
    [apply],
  );

  // Zoom keeping the point (px, py) -- in stage coords relative to its centre -- fixed on screen.
  const zoomTo = (scale: number, px = 0, py = 0, animate = true) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const cur = t.current;
    const ratio = s / cur.scale;
    t.current = clampInto({ scale: s, x: px - (px - cur.x) * ratio, y: py - (py - cur.y) * ratio });
    setZoomed(s > 1.01);
    apply(animate);
  };

  const stagePoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  };

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.min(count - 1, Math.max(0, i + delta));
        return next;
      });
    },
    [count],
  );

  // New photo -> fresh transform.
  useEffect(() => {
    natural.current = null;
    t.current = { scale: 1, x: 0, y: 0 };
    setZoomed(false);
    apply(false);
    setDeleteOpen(false);
    setReactOpen(false);
  }, [index, apply]);

  // Preload the neighbours so swiping is instant.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const p = photos[i];
      if (p) {
        const img = new Image();
        img.src = cldOptimize(p.url, { width: 2000, crop: 'limit' }) ?? p.url;
      }
    });
  }, [index, photos]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteOpen || reactOpen) {
          setDeleteOpen(false);
          setReactOpen(false);
        } else onClose();
      } else if (e.key === 'ArrowLeft') go(1); // RTL: left is "next"
      else if (e.key === 'ArrowRight') go(-1);
      else if (e.key === '+' || e.key === '=') zoomTo(t.current.scale * 1.5);
      else if (e.key === '-') zoomTo(t.current.scale / 1.5);
      else if (e.key === '0') reset();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, go, reset, deleteOpen, reactOpen]);

  // Wheel zoom (needs a non-passive listener to stop the page from scrolling).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = stagePoint(e.clientX, e.clientY);
      zoomTo(t.current.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y, false);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // ---- pointer gestures ----
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const g = gesture.current;
    stageRef.current?.setPointerCapture(e.pointerId);
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.mode = 'pinch';
      g.start = {
        ...g.start,
        t: { ...t.current },
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    } else if (g.pointers.size === 1) {
      g.mode = 'pending';
      g.start = { ...g.start, x: e.clientX, y: e.clientY, time: Date.now(), t: { ...t.current } };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === 'pinch' && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s0 = g.start.t;
      const scale = Math.min(MAX_SCALE * 1.2, Math.max(0.7, s0.scale * (dist / Math.max(g.start.dist, 1))));
      // Keep the content point that was under the fingers under the fingers.
      const px = (g.start.mid.x - s0.x) / s0.scale;
      const py = (g.start.mid.y - s0.y) / s0.scale;
      t.current = { scale, x: mid.x - px * scale, y: mid.y - py * scale };
      apply(false);
      return;
    }

    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < 8) return;
      if (t.current.scale > 1.01) g.mode = 'pan';
      else if (Math.abs(dy) > Math.abs(dx) && dy > 0) g.mode = 'dismiss';
      else if (count > 1 && Math.abs(dx) > Math.abs(dy)) g.mode = 'swipe';
      else g.mode = 'pan';
    }
    if (g.mode === 'pan') {
      const b = bounds(t.current.scale);
      const rubber = (v: number, limit: number) => (Math.abs(v) <= limit ? v : Math.sign(v) * (limit + (Math.abs(v) - limit) * 0.3));
      t.current = { scale: t.current.scale, x: rubber(g.start.t.x + dx, b.x), y: rubber(g.start.t.y + dy, b.y) };
      apply(false);
    } else if (g.mode === 'swipe') {
      // Resist at the ends of the album.
      const atEnd = (dx > 0 && index === count - 1) || (dx < 0 && index === 0);
      t.current = { scale: 1, x: atEnd ? dx * 0.3 : dx, y: 0 };
      apply(false);
    } else if (g.mode === 'dismiss') {
      t.current = { scale: Math.max(0.8, 1 - dy / 1600), x: dx * 0.4, y: dy };
      apply(false);
      setBackdrop(Math.max(0.15, 1 - dy / 420));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    const dt = Math.max(1, Date.now() - g.start.time);

    if (g.mode === 'pinch') {
      if (g.pointers.size === 1) {
        // One finger lifted: continue as a pan from here.
        const [p] = [...g.pointers.values()];
        g.mode = 'pan';
        g.start = { ...g.start, x: p.x, y: p.y, time: Date.now(), t: { ...t.current } };
        return;
      }
      if (t.current.scale <= 1.02) reset();
      else {
        t.current = clampInto({ ...t.current, scale: Math.min(MAX_SCALE, t.current.scale) });
        setZoomed(true);
        apply(true);
      }
      g.mode = 'none';
      return;
    }
    if (g.pointers.size > 0) return;

    if (g.mode === 'pan') {
      t.current = clampInto(t.current);
      apply(true);
    } else if (g.mode === 'swipe') {
      const width = stageRef.current?.clientWidth ?? 400;
      const fast = Math.abs(dx) / dt > 0.5;
      const dir = dx > 0 ? 1 : -1; // RTL: dragging right reveals the next photo
      const target = index + dir;
      if ((Math.abs(dx) > width * 0.2 || fast) && target >= 0 && target < count) {
        t.current = { scale: 1, x: dir * width, y: 0 };
        apply(true);
        setTimeout(() => setIndex(target), 180);
      } else {
        reset();
      }
    } else if (g.mode === 'dismiss') {
      if (dy > 120 || dy / dt > 0.7) {
        t.current = { scale: 0.85, x: t.current.x, y: window.innerHeight };
        apply(true);
        setBackdrop(0, true);
        setTimeout(onClose, 200);
      } else {
        reset();
        setBackdrop(1, true);
      }
    } else if (g.mode === 'pending') {
      // A tap: double-tap zooms (to the tapped point), a single tap toggles the chrome.
      const now = Date.now();
      const last = g.lastTap;
      if (now - last.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        if (g.tapTimer) clearTimeout(g.tapTimer);
        g.tapTimer = null;
        g.lastTap = { time: 0, x: 0, y: 0 };
        if (t.current.scale > 1.01) reset();
        else {
          const p = stagePoint(e.clientX, e.clientY);
          zoomTo(2.5, p.x, p.y);
        }
      } else {
        g.lastTap = { time: now, x: e.clientX, y: e.clientY };
        if (g.tapTimer) clearTimeout(g.tapTimer);
        g.tapTimer = setTimeout(() => {
          g.tapTimer = null;
          setChrome((v) => !v);
        }, DOUBLE_TAP_MS);
      }
    }
    g.mode = 'none';
  }

  useEffect(
    () => () => {
      if (gesture.current.tapTimer) clearTimeout(gesture.current.tapTimer);
    },
    [],
  );

  // ---- actions ----
  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(current.url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0];
      const base = (current.name || 'photo').replace(/\.[a-z0-9]{2,5}$/i, '');
      await saveBlob(blob, `${base}.${ext}`);
    } catch {
      window.open(current.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const file = new File([blob], current.name || 'photo.jpg', { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: current.name || 'صورة' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ url: current.url, title: current.name || 'صورة' });
        return;
      }
      await navigator.clipboard.writeText(current.url);
      showToast('تم نسخ رابط الصورة.');
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') showToast('تعذّرت المشاركة.', 'error');
    }
  }

  const canShare = typeof navigator !== 'undefined' && (typeof navigator.share === 'function' || !!navigator.clipboard);
  const fullSrc = cldOptimize(current.url, { width: 2000, crop: 'limit' });
  const lowSrc = cldOptimize(current.url, { width: 480, crop: 'limit' });
  const isLoaded = !!loaded[current.url];

  if (!mounted) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[9999] select-none text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label="عارض الصور"
    >
      <div ref={backdropRef} className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />

      {/* Stage */}
      <div
        ref={stageRef}
        className={cn('absolute inset-0 touch-none overflow-hidden', zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={imageRef} className="flex h-full w-full items-center justify-center will-change-transform">
          {!isLoaded && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lowSrc} alt="" aria-hidden draggable={false} className="absolute max-h-full max-w-full scale-[1.01] object-contain blur-md" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.url}
            src={fullSrc}
            alt={current.name}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              natural.current = { w: img.naturalWidth, h: img.naturalHeight };
              setLoaded((prev) => ({ ...prev, [current.url]: true }));
            }}
            className={cn('relative max-h-full max-w-full object-contain transition-opacity duration-300', isLoaded ? 'opacity-100' : 'opacity-0')}
          />
        </div>
        {!isLoaded && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </span>
        )}
      </div>

      {/* Top bar */}
      <AnimatePresence>
        {chrome && (
          <motion.div
            key="top"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pb-10 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-5"
          >
            <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15">
              <X className="h-6 w-6" />
            </button>
            {senderName ? (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar src={assetUrl(senderPhotoUrl)} name={senderName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{senderName}</p>
                  {createdAt && <p className="truncate text-[11px] text-white/65">{formatFullDate(createdAt)}</p>}
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            {count > 1 && <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold tabular-nums" dir="ltr">{index + 1} / {count}</span>}
            <button
              type="button"
              onClick={() => (zoomed ? reset() : zoomTo(2.5))}
              aria-label={zoomed ? 'تصغير' : 'تكبير'}
              title={zoomed ? 'تصغير (0)' : 'تكبير (+)'}
              className="hidden h-10 w-10 items-center justify-center rounded-full hover:bg-white/15 sm:flex"
            >
              {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => void download()} aria-label="تنزيل" title="تنزيل" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </button>
            {canShare && (
              <button type="button" onClick={() => void share()} aria-label="مشاركة" title="مشاركة" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15">
                <Share2 className="h-5 w-5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Album arrows (pointer devices) */}
      {chrome && count > 1 && (
        <>
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="الصورة السابقة"
              className="absolute right-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 backdrop-blur hover:bg-black/70 md:flex"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="الصورة التالية"
              className="absolute left-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 backdrop-blur hover:bg-black/70 md:flex"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}
        </>
      )}

      {/* Bottom: caption, thumbnails, actions */}
      <AnimatePresence>
        {chrome && (
          <motion.div
            key="bottom"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute inset-x-0 bottom-0 z-10 space-y-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-12 sm:px-5"
          >
            {captionText && (
              <button
                type="button"
                onClick={() => setCaptionOpen((v) => !v)}
                dir="auto"
                className={cn(
                  'mx-auto block max-w-2xl whitespace-pre-wrap break-words text-start text-[15px] leading-relaxed text-white/95',
                  !captionOpen && 'line-clamp-2',
                )}
              >
                {captionText.replace(/@\[([^\]]+)\]\(([0-9a-fA-F]{24})\)/g, '@$1')}
              </button>
            )}

            {count > 1 && (
              <div className="mx-auto flex max-w-2xl justify-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {photos.map((p, i) => (
                  <button
                    key={`${p.url}-${i}`}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`الصورة ${i + 1}`}
                    className={cn(
                      'h-12 w-12 shrink-0 overflow-hidden rounded-lg transition-all',
                      i === index ? 'ring-2 ring-white' : 'opacity-55 hover:opacity-90',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cldOptimize(p.url, { width: 120 })} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="relative mx-auto flex w-fit max-w-full items-center gap-1 rounded-full bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur-xl">
              <AnimatePresence>
                {reactOpen && (
                  // Centred with framer's own `x`, not Tailwind's -translate-x-1/2: framer writes the
                  // whole inline `transform` for the pop-in, which silently dropped the Tailwind
                  // translate and pushed half the bar off the right edge of the screen.
                  <motion.div
                    initial={{ opacity: 0, x: '-50%', y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: '-50%', y: 8, scale: 0.9 }}
                    className="absolute bottom-full left-1/2 mb-3 flex gap-0.5 rounded-full bg-neutral-900/95 p-1.5 shadow-2xl ring-1 ring-white/10"
                  >
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onReact(message, emoji);
                          setReactOpen(false);
                          showToast(`تم التفاعل ${emoji}`);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-125 min-[400px]:h-10 min-[400px]:w-10 min-[400px]:text-[22px]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
                {deleteOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: '-50%', y: 8 }}
                    animate={{ opacity: 1, x: '-50%', y: 0 }}
                    exit={{ opacity: 0, x: '-50%', y: 8 }}
                    className="absolute bottom-full left-1/2 mb-3 w-56 overflow-hidden rounded-2xl bg-neutral-900/95 py-1 shadow-2xl ring-1 ring-white/10"
                  >
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(message, true);
                          onClose();
                        }}
                        className="block w-full px-4 py-2.5 text-start text-sm font-medium text-rose-400 hover:bg-white/10"
                      >
                        حذف لدى الجميع
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(message, false);
                        onClose();
                      }}
                      className="block w-full px-4 py-2.5 text-start text-sm text-rose-400 hover:bg-white/10"
                    >
                      حذف لديّ فقط
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <ActionButton
                label="رد"
                onClick={() => {
                  onReply(message);
                  onClose();
                }}
              >
                <Reply className="h-5 w-5" />
              </ActionButton>
              <ActionButton
                label="تفاعل"
                active={reactOpen}
                onClick={() => {
                  setDeleteOpen(false);
                  setReactOpen((v) => !v);
                }}
              >
                <SmilePlus className="h-5 w-5" />
              </ActionButton>
              {onForward && (
                <ActionButton
                  label="إعادة توجيه"
                  onClick={() => {
                    onForward(message);
                    onClose();
                  }}
                >
                  <Forward className="h-5 w-5" />
                </ActionButton>
              )}
              <ActionButton label={isStarred ? 'إلغاء التمييز' : 'تمييز بنجمة'} active={isStarred} onClick={() => onToggleStar(message)}>
                <Star className={cn('h-5 w-5', isStarred && 'fill-amber-400 text-amber-400')} />
              </ActionButton>
              {onGoToMessage && (
                <ActionButton label="الانتقال إلى الرسالة" onClick={onGoToMessage}>
                  <MessageSquareShare className="h-5 w-5" />
                </ActionButton>
              )}
              {isOwn && message.text && (
                <ActionButton
                  label="تعديل النص"
                  onClick={() => {
                    onEdit(message);
                    onClose();
                  }}
                >
                  <Pencil className="h-5 w-5" />
                </ActionButton>
              )}
              <ActionButton
                label="حذف"
                danger
                active={deleteOpen}
                onClick={() => {
                  setReactOpen(false);
                  setDeleteOpen((v) => !v);
                }}
              >
                <Trash2 className="h-5 w-5" />
              </ActionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

function ActionButton({
  label,
  onClick,
  children,
  active = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        active ? 'bg-white/25' : 'hover:bg-white/15',
        danger ? 'text-rose-400' : 'text-white',
      )}
    >
      {children}
    </button>
  );
}
