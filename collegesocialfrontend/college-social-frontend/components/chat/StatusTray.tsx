'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Loader2, Play, Plus, Send, Trash2, Video, Volume2, VolumeX, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { postVideoStatus, STATUS_VIDEO_MAX_SEC, type ChatStatus, type StatusUploadPhase } from '@/lib/chat-status';
import { attachHls, isHls } from '@/lib/hls';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/toast-context';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import { cldVideoOptimize, readVideoDuration } from '@/lib/video';

const STORY_MS = 5_000;
const SEEN_KEY = 'chatStatusSeen';
// Text statuses get a background picked from their id, so each one looks distinct but stable.
const BACKDROPS = [
  'from-indigo-500 to-violet-600',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-indigo-600',
  'from-amber-500 to-rose-500',
  'from-fuchsia-500 to-purple-700',
];

function backdropFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return BACKDROPS[Math.abs(h) % BACKDROPS.length];
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    // Statuses live 24h -- the newest few hundred ids are plenty.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-400)));
  } catch {
    /* private mode */
  }
}

// "الحالات": 24-hour photo/video/text statuses from friends and people you chat with, shown as rings at
// the top of the chat list (yours first). Tap to watch; reply goes to the author as a DM.
export function StatusTray() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<ChatStatus[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<{ authorId: string } | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    api
      .get<ChatStatus[]>('/chat/statuses')
      .then(setStatuses)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setSeen(readSeen());
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  // Oldest first within an author (a story plays in order); authors with something unseen first.
  const groups = useMemo(() => {
    const byAuthor = new Map<string, ChatStatus[]>();
    for (const s of statuses) {
      if (!s.author) continue;
      byAuthor.set(s.author._id, [...(byAuthor.get(s.author._id) ?? []), s]);
    }
    const list = [...byAuthor.entries()].map(([authorId, items]) => ({
      authorId,
      author: items[0].author!,
      items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      unseen: items.some((i) => !seen.has(i._id)),
      latest: items.reduce((max, i) => (i.createdAt > max ? i.createdAt : max), ''),
    }));
    return list
      .filter((g) => g.authorId !== user?._id)
      .sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.latest.localeCompare(a.latest));
  }, [statuses, seen, user?._id]);

  const mine = useMemo(
    () => statuses.filter((s) => s.author?._id === user?._id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [statuses, user?._id],
  );

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      writeSeen(next);
      return next;
    });
  }, []);

  if (!user) return null;

  const viewingItems = viewing
    ? viewing.authorId === user._id
      ? mine
      : (groups.find((g) => g.authorId === viewing.authorId)?.items ?? [])
    : [];

  return (
    <>
      <div className="flex gap-0.5 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Mine: tap to watch (if any), the + to add */}
        <div className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 px-1 py-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => (mine.length ? setViewing({ authorId: user._id }) : setComposing(true))}
              aria-label={mine.length ? 'عرض حالتك' : 'أضف حالة'}
              className={cn('rounded-full p-[2px]', mine.length ? 'bg-gradient-accent' : 'bg-border')}
            >
              <span className="block rounded-full bg-surface p-[2px]">
                <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setComposing(true)}
              aria-label="أضف حالة"
              className="absolute -bottom-0.5 -end-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
          <span className="w-full truncate text-center text-[11px] font-medium text-foreground">حالتي</span>
        </div>

        {groups.map((g) => (
          <button
            key={g.authorId}
            type="button"
            onClick={() => setViewing({ authorId: g.authorId })}
            className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors hover:bg-surface-2 active:scale-95"
          >
            <span className={cn('rounded-full p-[2px]', g.unseen ? 'bg-gradient-warm' : 'bg-border')}>
              <span className="block rounded-full bg-surface p-[2px]">
                <Avatar src={assetUrl(g.author.photoUrl)} name={g.author.name} size="md" />
              </span>
            </span>
            <span dir="auto" className="w-full truncate text-center text-[11px] font-medium text-foreground">
              {g.author.name.split(/\s+/)[0]}
            </span>
          </button>
        ))}
      </div>

      {viewing && viewingItems.length > 0 && (
        <StatusViewer
          // A fresh viewer per author, so the next person's stories start from their first one.
          key={viewing.authorId}
          items={viewingItems}
          own={viewing.authorId === user._id}
          onSeen={markSeen}
          onClose={() => setViewing(null)}
          onDeleted={(id) => setStatuses((prev) => prev.filter((s) => s._id !== id))}
          onNextAuthor={() => {
            if (viewing.authorId === user._id) return setViewing(null);
            const i = groups.findIndex((g) => g.authorId === viewing.authorId);
            const next = groups[i + 1];
            setViewing(next ? { authorId: next.authorId } : null);
          }}
        />
      )}

      <StatusComposer
        open={composing}
        activeCount={mine.length}
        onClose={() => setComposing(false)}
        onPosted={(status) => {
          setStatuses((prev) => [status, ...prev]);
          markSeen(status._id);
        }}
      />
    </>
  );
}

// Remembered for the session: once someone mutes a story video, the next one starts muted too.
let storySound = true;
// A video that stops advancing this long (dead stream, stalled network) is treated as failed.
const VIDEO_STALL_MS = 15_000;

function StatusViewer({
  items,
  own,
  onSeen,
  onClose,
  onDeleted,
  onNextAuthor,
}: {
  items: ChatStatus[];
  own: boolean;
  onSeen: (id: string) => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onNextAuthor: () => void;
}) {
  const { socket } = useSocket();
  const { showToast } = useToast();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(!storySound);
  const [buffering, setBuffering] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  // Autoplay refused outright (e.g. iOS Low Power Mode): show a play button instead of a spinner.
  const [needsTap, setNeedsTap] = useState(false);
  const startedAt = useRef(Date.now());
  const elapsedBeforePause = useRef(0);
  // One <video> for the whole viewer: iOS lets an element that already played after a tap keep
  // playing with sound when its source changes -- a freshly mounted one would start muted.
  const videoRef = useRef<HTMLVideoElement>(null);

  const item = items[Math.min(index, items.length - 1)];
  const author = item.author!;
  const videoUrl = item.videoUrl ?? null;
  // Photos and text run on a fixed clock; so does a video that won't play, so the story moves on.
  const timed = !videoUrl || videoFailed;

  // Restart the clock whenever the story changes.
  useEffect(() => {
    onSeen(item._id);
    startedAt.current = Date.now();
    elapsedBeforePause.current = 0;
    setProgress(0);
    setVideoFailed(false);
    setNeedsTap(false);
  }, [item._id, onSeen]);

  useEffect(() => {
    if (!timed) return;
    if (paused) {
      elapsedBeforePause.current += Date.now() - startedAt.current;
      return;
    }
    startedAt.current = Date.now();
    const t = setInterval(() => {
      const elapsed = elapsedBeforePause.current + Date.now() - startedAt.current;
      const p = Math.min(1, elapsed / STORY_MS);
      setProgress(p);
      if (p >= 1) {
        clearInterval(t);
        if (index < items.length - 1) setIndex((i) => i + 1);
        else onNextAuthor();
      }
    }, 50);
    return () => clearInterval(t);
  }, [timed, paused, index, items.length, onNextAuthor]);

  // Video source for the current story: Stream's HLS through hls.js (native on Safari), Cloudinary
  // MP4s with automatic format/quality.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setBuffering(true);
    if (isHls(videoUrl)) return attachHls(video, videoUrl);
    video.src = cldVideoOptimize(videoUrl) ?? videoUrl;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [item._id, videoUrl]);

  // Play/pause follows the hold gesture and the reply box; the progress bar follows the playhead.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || videoFailed) return;
    if (paused) {
      video.pause();
      return;
    }
    video.muted = muted;
    video.play().catch((err: unknown) => {
      if ((err as DOMException)?.name !== 'NotAllowedError') return;
      if (video.muted) {
        setNeedsTap(true);
        return;
      }
      // Sound needs a fresh tap on this browser: play muted and let the speaker button unmute.
      video.muted = true;
      setMuted(true);
      video.play().catch(() => setNeedsTap(true));
    });
    let lastTime = -1;
    let lastMove = Date.now();
    const t = setInterval(() => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) setProgress(Math.min(1, video.currentTime / d));
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastMove = Date.now();
      } else if (!video.paused && Date.now() - lastMove > VIDEO_STALL_MS) {
        setVideoFailed(true);
      }
    }, 80);
    return () => clearInterval(t);
  }, [item._id, videoUrl, videoFailed, paused, muted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function step(delta: 1 | -1) {
    if (delta === 1) {
      if (index < items.length - 1) setIndex(index + 1);
      else onNextAuthor();
    } else if (index > 0) setIndex(index - 1);
  }

  function toggleSound() {
    const next = !muted;
    storySound = !next;
    setMuted(next);
    const video = videoRef.current;
    if (video) {
      video.muted = next;
      void video.play().catch(() => undefined);
    }
  }

  function playAfterTap() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !storySound;
    setMuted(!storySound);
    video
      .play()
      .then(() => setNeedsTap(false))
      .catch(() => undefined);
  }

  async function remove() {
    try {
      await api.delete(`/chat/statuses/${item._id}`);
      onDeleted(item._id);
      showToast('تم حذف الحالة.');
      if (items.length <= 1) onClose();
      else setIndex((i) => Math.max(0, Math.min(i, items.length - 2)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر حذف الحالة.', 'error');
    }
  }

  // A reply is a DM to the author, quoting what it answers.
  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    if (!socket?.connected) {
      showToast('لا يوجد اتصال الآن — حاول بعد لحظات.', 'error');
      return;
    }
    setSending(true);
    try {
      const conversation = await api.post<{ _id: string }>('/chat/conversations', { participantIds: [author._id] });
      const quoted = item.text
        ? `«${item.text.slice(0, 80)}${item.text.length > 80 ? '…' : ''}»`
        : videoUrl
          ? '«فيديو»'
          : '«صورة»';
      socket.emit('sendMessage', { conversationId: conversation._id, text: `↩️ ردًا على حالتك ${quoted}\n${text}` });
      setReply('');
      showToast('تم إرسال ردك.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّر إرسال الرد.', 'error');
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[10040] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`حالة ${author.name}`}
    >
      {/* Progress */}
      <div className="flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        {items.map((s, i) => (
          <span key={s._id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              className="block h-full bg-white"
              style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar src={assetUrl(author.photoUrl)} name={author.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{own ? 'حالتي' : author.name}</p>
          <p className="text-[11px] text-white/70">{timeAgo(item.createdAt)}</p>
        </div>
        {videoUrl && !videoFailed && (
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className="rounded-full p-2 hover:bg-white/15"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}
        {own && (
          <button type="button" onClick={() => void remove()} aria-label="حذف الحالة" className="rounded-full p-2 hover:bg-white/15">
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-2 hover:bg-white/15">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content -- tap the left half for next, right half for previous (RTL), hold to pause */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <video
          ref={videoRef}
          poster={item.posterUrl ?? undefined}
          playsInline
          autoPlay
          preload="auto"
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setBuffering(false);
            setNeedsTap(false);
          }}
          onEnded={() => step(1)}
          onError={() => setVideoFailed(true)}
          className={cn('absolute inset-0 h-full w-full object-contain', timed && 'hidden')}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={item._id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {videoUrl ? (
              videoFailed ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <Video className="h-10 w-10 text-white/60" />
                  <p className="text-sm text-white/80">تعذّر تشغيل الفيديو</p>
                  {item.text && (
                    <p dir="auto" className="max-w-md text-[15px] leading-relaxed">
                      {item.text}
                    </p>
                  )}
                </div>
              ) : (
                item.text && (
                  <p
                    dir="auto"
                    className="absolute inset-x-4 bottom-4 mx-auto max-w-md rounded-xl bg-black/50 px-4 py-2 text-center text-[15px] leading-relaxed"
                  >
                    {item.text}
                  </p>
                )
              )
            ) : item.imageUrl ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(item.imageUrl) ?? ''} alt="" className="max-h-[78%] max-w-full rounded-xl object-contain" />
                {item.text && (
                  <p dir="auto" className="max-w-md rounded-xl bg-black/50 px-4 py-2 text-center text-[15px] leading-relaxed">
                    {item.text}
                  </p>
                )}
              </div>
            ) : (
              <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br p-8', backdropFor(item._id))}>
                <p dir="auto" className="max-w-lg whitespace-pre-wrap text-center text-2xl font-bold leading-relaxed drop-shadow sm:text-3xl">
                  {item.text}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {videoUrl && !videoFailed && buffering && !needsTap && (
          <Loader2 aria-hidden className="pointer-events-none absolute h-10 w-10 animate-spin text-white/80" />
        )}
        <button type="button" aria-label="التالي" onClick={() => step(1)} className="absolute inset-y-0 start-1/2 end-0 z-10 cursor-pointer" />
        <button type="button" aria-label="السابق" onClick={() => step(-1)} className="absolute inset-y-0 start-0 end-1/2 z-10 cursor-pointer" />
        {videoUrl && !videoFailed && needsTap && (
          <button
            type="button"
            onClick={playAfterTap}
            aria-label="تشغيل الفيديو"
            className="absolute z-20 flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur"
          >
            <Play className="h-8 w-8 fill-white" />
          </button>
        )}
      </div>

      {!own && (
        <form
          className="flex items-center gap-2 px-3 pb-[calc(0.75rem+var(--safe-bottom))] pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendReply();
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            placeholder={`رد على ${author.name.split(/\s+/)[0]}…`}
            maxLength={1000}
            className="h-11 min-w-0 flex-1 rounded-full bg-white/15 px-4 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <button
            type="submit"
            disabled={!reply.trim() || sending}
            aria-label="إرسال الرد"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
          </button>
        </form>
      )}
    </motion.div>,
    document.body,
  );
}

const UPLOAD_LABEL: Record<StatusUploadPhase, string> = {
  preparing: 'جارٍ تجهيز الفيديو…',
  uploading: 'جارٍ رفع الفيديو…',
  processing: 'جارٍ معالجة الفيديو…',
};

function StatusComposer({
  open,
  activeCount,
  onClose,
  onPosted,
}: {
  open: boolean;
  /** Your stories still live right now -- the server allows five per 24h. */
  activeCount: number;
  onClose: () => void;
  onPosted: (status: ChatStatus) => void;
}) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ phase: StatusUploadPhase; percent: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isVideo = !!file?.type.startsWith('video/');

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setText('');
    setFile(null);
  }

  // Too-long videos are turned away before any upload; one the browser can't measure (an exotic
  // codec) still goes up and the server checks its real length.
  async function pick(next: File | undefined) {
    if (!next) return;
    if (next.type.startsWith('video/')) {
      const seconds = await readVideoDuration(next).catch(() => null);
      if (seconds !== null && seconds > STATUS_VIDEO_MAX_SEC + 0.5) {
        showToast(
          `مدة الفيديو ${Math.round(seconds)} ثانية والحد الأقصى ${STATUS_VIDEO_MAX_SEC} ثانية. قصّه من معرض الصور ثم اختره مرة أخرى.`,
          'error',
        );
        return;
      }
    }
    setFile(next);
  }

  // Closing mid-upload cancels it.
  function close() {
    abortRef.current?.abort();
    onClose();
  }

  async function publish() {
    if (busy || (!text.trim() && !file)) return;
    if (activeCount >= 5) {
      showToast('يمكنك مشاركة خمس حالات خلال 24 ساعة، احذف حالة أولًا', 'error');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      let status: ChatStatus;
      if (file && isVideo) {
        status = await postVideoStatus({
          file,
          text: text.trim(),
          signal: controller.signal,
          onProgress: (phase, percent) => setUpload({ phase, percent }),
        });
      } else {
        let imageUrl: string | undefined;
        if (file) {
          const uploaded = await api.uploadMany<{ images: string[] }>('/upload/post-images', [file]);
          imageUrl = uploaded.images[0];
        }
        status = await api.post<ChatStatus>('/chat/statuses', { text: text.trim() || undefined, imageUrl });
      }
      onPosted(status);
      showToast('تم نشر حالتك لمدة 24 ساعة.');
      reset();
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : '';
      // Library errors (network, codecs) come in English -- only show messages meant for users.
      showToast(/[؀-ۿ]/.test(message) ? message : 'تعذّر نشر الحالة.', 'error');
    } finally {
      setBusy(false);
      setUpload(null);
      abortRef.current = null;
    }
  }

  return (
    <Modal open={open} onClose={close} title="حالة جديدة" className="max-w-md">
      <div className="space-y-3">
        {preview ? (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {isVideo ? (
              <video src={preview} controls playsInline className="max-h-72 w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-72 w-full object-contain" />
            )}
            {!busy && (
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={isVideo ? 'إزالة الفيديو' : 'إزالة الصورة'}
                className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-5 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <ImagePlus className="h-5 w-5" />
            <Video className="h-5 w-5" />
            أضف صورة أو فيديو (اختياري)
          </button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          rows={3}
          dir="auto"
          disabled={busy}
          placeholder={file ? 'أضف تعليقًا…' : 'بماذا تفكر؟ تختفي الحالة بعد 24 ساعة'}
          className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        {upload && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>{UPLOAD_LABEL[upload.phase]}</span>
              <span dir="ltr">{upload.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${upload.percent}%` }} />
            </div>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          يراها أصدقاؤك ومن تتراسل معهم فقط. الفيديو حتى {STATUS_VIDEO_MAX_SEC} ثانية. لا تنشر أرقام هواتف أو معلومات خاصة.
        </p>
        <Button fullWidth disabled={busy || (!text.trim() && !file)} onClick={() => void publish()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
          نشر الحالة
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/*"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </Modal>
  );
}
