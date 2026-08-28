'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { Reel, ReelFeedPage } from '@/lib/types';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reels, setReels] = useState<Reel[]>(initialReels);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
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

  async function handleShare(reel: Reel) {
    const url = `${window.location.origin}/reels/${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ريل على اكاديميا', text: reel.caption || 'شاهد هذا الريل', url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('تم نسخ الرابط.', 'success');
      }
    } catch {
      /* user cancelled the share sheet */
    }
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
    <div className="relative h-full w-full bg-black">
      {reels.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/80">
          <p className="text-lg font-semibold">لا توجد ريلز بعد</p>
          <p className="text-sm">كن أول من ينشر ريل في اكاديميا.</p>
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

      <button
        onClick={() => setUploadOpen(true)}
        aria-label="ريل جديد"
        className="absolute bottom-24 start-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-elev-4 active:scale-90 md:bottom-6"
      >
        <Plus className="h-7 w-7" />
      </button>

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
    </div>
  );
}
