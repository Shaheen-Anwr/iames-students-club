'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, Clapperboard } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { Reel, ReelFeedPage } from '@/lib/types';
import { ShareSheet } from '@/components/shared/ShareSheet';
import { ReelCard } from './ReelCard';
import { ReelCommentsSheet } from './ReelCommentsSheet';
import { ReelUploadSheet } from './ReelUploadSheet';

interface Props {
  initialReels: Reel[];
  initialHasMore: boolean;
  initialPage?: number;
}

export function ReelsExperience({ initialReels, initialHasMore, initialPage = 1 }: Props) {
  const { showToast } = useToast();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reels, setReels] = useState<Reel[]>(initialReels);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const patchReel = useCallback((id: string, patch: Partial<Reel>) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await api.get<ReelFeedPage>(`/reels?page=${page + 1}&limit=10`);
      setReels((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...next.data.filter((r) => !seen.has(r.id))];
      });
      setPage(next.page);
      setHasMore(next.hasMore);
    } catch {
      /* transient — retried on next scroll */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  // Track which slide is centred; prefetch more near the end.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        setActiveIndex((prev) => (prev === idx ? prev : idx));
        if (idx >= reels.length - 3) loadMore();
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reels.length, loadMore]);

  // Immersive view: lock the page behind it from scrolling while reels is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }

  async function handleLike(reel: Reel) {
    patchReel(reel.id, {
      likedByMe: !reel.likedByMe,
      likeCount: reel.likeCount + (reel.likedByMe ? -1 : 1),
    });
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/reels/${reel.id}/like`);
      patchReel(reel.id, { likedByMe: res.liked, likeCount: res.likeCount });
    } catch {
      patchReel(reel.id, { likedByMe: reel.likedByMe, likeCount: reel.likeCount });
    }
  }

  async function handleSave(reel: Reel) {
    patchReel(reel.id, { savedByMe: !reel.savedByMe });
    try {
      const res = await api.post<{ saved: boolean }>(`/reels/${reel.id}/save`);
      patchReel(reel.id, { savedByMe: res.saved });
      showToast(res.saved ? 'تم الحفظ.' : 'أُزيل من المحفوظات.', 'info');
    } catch {
      patchReel(reel.id, { savedByMe: reel.savedByMe });
    }
  }

  function handleShare(reel: Reel) {
    setShareReel(reel);
  }

  async function handleDelete(reel: Reel) {
    if (!window.confirm('حذف هذا الريل نهائيًا؟')) return;
    const prev = reels;
    setReels((r) => r.filter((x) => x.id !== reel.id));
    try {
      await api.delete(`/reels/${reel.id}`);
      showToast('تم حذف الريل.', 'success');
    } catch {
      setReels(prev);
      showToast('تعذّر حذف الريل.', 'error');
    }
  }

  function handleView(reel: Reel) {
    api.post(`/reels/${reel.id}/view`).catch(() => {});
  }

  function handleCreated(reel: Reel) {
    setReels((prev) => [reel, ...prev.filter((r) => r.id !== reel.id)]);
    setActiveIndex(0);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {/* Top overlay bar — back / brand / create. Sits above the slides, never pushes them. The
          wrapper is click-through; only the buttons catch taps so the video stays tappable. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent px-2 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          onClick={goBack}
          aria-label="رجوع"
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full text-white/95 transition active:scale-90 hover:bg-white/10"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        <span className="select-none text-base font-extrabold tracking-tight drop-shadow">اكاديميا</span>

        <button
          onClick={() => setUploadOpen(true)}
          aria-label="ريل جديد"
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full text-white/95 transition active:scale-90 hover:bg-white/10"
        >
          <Plus className="h-6 w-6" />
        </button>
      </header>

      {reels.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10">
            <Clapperboard className="h-8 w-8 text-white/80" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-bold">لا توجد ريلز بعد</p>
            <p className="text-sm text-white/60">كن أول من ينشر ريل في اكاديميا.</p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="mt-1 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            أضِف ريل
          </button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain scrollbar-none"
        >
          {reels.map((reel, i) => (
            <div key={reel.id} className="h-full w-full snap-start snap-always">
              <ReelCard
                reel={reel}
                active={i === activeIndex}
                mounted={Math.abs(i - activeIndex) <= 1}
                muted={muted}
                onToggleMuted={() => setMuted((m) => !m)}
                onLike={() => handleLike(reel)}
                onSave={() => handleSave(reel)}
                onOpenComments={() => setCommentsFor(reel.id)}
                onShare={() => handleShare(reel)}
                onDelete={() => handleDelete(reel)}
                onView={() => handleView(reel)}
              />
            </div>
          ))}
        </div>
      )}

      <ReelCommentsSheet
        reelId={commentsFor}
        onClose={() => setCommentsFor(null)}
        onCountChange={(delta) => {
          if (commentsFor) {
            setReels((prev) =>
              prev.map((r) =>
                r.id === commentsFor ? { ...r, commentCount: Math.max(0, r.commentCount + delta) } : r,
              ),
            );
          }
        }}
      />

      <ReelUploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} onCreated={handleCreated} />

      <ShareSheet
        open={shareReel !== null}
        onClose={() => setShareReel(null)}
        heading="مشاركة الريل"
        title={shareReel?.caption ? `${shareReel.caption} — ريل على اكاديميا` : 'شاهد هذا الريل على اكاديميا'}
        url={shareReel ? `/reels/${shareReel.id}` : ''}
      />
    </div>
  );
}
