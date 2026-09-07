'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Share2, Bookmark, Play, Volume2, VolumeX, Trash2, Eye } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { viaCdn } from '@/lib/media';
import { attachHls, isHls } from '@/lib/hls';
import { assetUrl, cn, timeAgo } from '@/lib/utils';
import type { Reel } from '@/lib/types';

interface ReelCardProps {
  reel: Reel;
  active: boolean;
  // Only mount the <video> source for the active slide and its immediate neighbours -- keeps the
  // browser from decoding a whole feed of clips at once.
  mounted: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onLike: () => void;
  onSave: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onDelete: () => void;
  onView: () => void;
}

// Compact count formatting: 1200 -> "1.2k".
function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

export function ReelCard({
  reel,
  active,
  mounted,
  muted,
  onToggleMuted,
  onLike,
  onSave,
  onOpenComments,
  onShare,
  onDelete,
  onView,
}: ReelCardProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const viewCounted = useRef(false);
  const viewTimer = useRef<ReturnType<typeof setTimeout>>();
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  const canDelete = !!user && (user._id === reel.author?.id || user.role === 'admin');

  // Route the clip + poster through the Cloudflare edge cache when configured (no-op otherwise).
  // Stream reels serve an HLS manifest -- don't proxy that (the .m3u8 references its own segment
  // URLs on the Stream domain); a plain Cloudinary URL still goes through viaCdn.
  const hlsReel = reel.videoProvider === 'stream' || isHls(reel.videoUrl);
  const videoSrc = hlsReel ? reel.videoUrl : viaCdn(reel.videoUrl) ?? reel.videoUrl;
  const posterSrc = viaCdn(reel.thumbnailUrl) ?? reel.thumbnailUrl;

  // HLS (Stream) reels: attach via hls.js (or native on Safari). Cloudinary reels: plain <video src>.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !mounted) return;
    if (hlsReel) return attachHls(v, videoSrc);
    v.src = videoSrc;
    return () => {
      v.removeAttribute('src');
    };
  }, [hlsReel, videoSrc, mounted]);

  // Play / pause follows the active slide.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && mounted) {
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
      viewTimer.current = setTimeout(() => {
        if (!viewCounted.current) {
          viewCounted.current = true;
          onViewRef.current();
        }
      }, 2000);
    } else {
      v.pause();
      v.currentTime = 0;
      setProgress(0);
      setExpanded(false);
      clearTimeout(viewTimer.current);
    }
    return () => clearTimeout(viewTimer.current);
  }, [active, mounted]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPaused(false)).catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  }, []);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (!reel.likedByMe) onLike();
      setBurst(true);
      setTimeout(() => setBurst(false), 650);
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current && Date.now() - lastTap.current >= 280) {
          togglePlay();
          lastTap.current = 0;
        }
      }, 300);
    }
  }, [reel.likedByMe, onLike, togglePlay]);

  const authorHref = reel.author ? `/profile/${reel.author.id}` : '#';

  return (
    <section className="relative h-full w-full overflow-hidden bg-black">
      {/* Blurred fill behind the letterboxed media so portrait/odd-ratio clips don't sit in hard
          black bars. Pure decoration. */}
      <img
        src={posterSrc}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
      />

      {mounted ? (
        <video
          ref={videoRef}
          poster={posterSrc}
          loop
          playsInline
          muted={muted}
          preload={active ? 'auto' : 'metadata'}
          className="absolute inset-0 h-full w-full object-contain"
          onClick={handleTap}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress((v.currentTime / v.duration) * 100);
          }}
        />
      ) : (
        <img
          src={posterSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {/* readability gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

      {/* paused indicator */}
      {paused && active && (
        <button
          onClick={togglePlay}
          aria-label="تشغيل"
          className="absolute inset-0 z-10 grid place-items-center"
        >
          <span className="rounded-full bg-black/40 p-5 backdrop-blur-sm">
            <Play className="h-10 w-10 fill-white text-white" />
          </span>
        </button>
      )}

      {/* double-tap heart burst */}
      {burst && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <Heart className="h-24 w-24 animate-ping fill-white/90 text-white/90" />
        </div>
      )}

      {/* top-corner controls — pushed below the ReelsExperience header bar */}
      <button
        onClick={onToggleMuted}
        aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        className="absolute end-3 top-14 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-90"
      >
        {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
      </button>

      {canDelete && (
        <button
          onClick={onDelete}
          aria-label="حذف الريل"
          className="absolute start-3 top-14 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-90"
        >
          <Trash2 className="h-[18px] w-[18px]" />
        </button>
      )}

      {/* right action rail */}
      <div className="absolute bottom-6 end-2 z-30 flex flex-col items-center gap-4 text-white">
        <Link href={authorHref} aria-label={reel.author?.name ?? 'الملف الشخصي'} className="mb-1">
          <Avatar src={assetUrl(reel.author?.photoUrl)} name={reel.author?.name ?? 'مستخدم'} size="md" ring />
        </Link>

        <RailButton
          label={fmt(reel.likeCount)}
          onClick={onLike}
          active={reel.likedByMe}
          icon={<Heart className={cn('h-7 w-7', reel.likedByMe && 'fill-rose-500 text-rose-500')} />}
        />
        <RailButton
          label={fmt(reel.commentCount)}
          onClick={onOpenComments}
          icon={<MessageCircle className="h-7 w-7" />}
        />
        <RailButton
          label={fmt(reel.viewCount)}
          icon={<Eye className="h-7 w-7" />}
        />
        <RailButton
          label="مشاركة"
          onClick={onShare}
          icon={<Share2 className="h-7 w-7" />}
        />
        <RailButton
          label={reel.savedByMe ? 'محفوظ' : 'حفظ'}
          onClick={onSave}
          active={reel.savedByMe}
          icon={<Bookmark className={cn('h-7 w-7', reel.savedByMe && 'fill-white')} />}
        />
      </div>

      {/* caption block */}
      <div className="absolute bottom-6 start-3 z-20 max-w-[74%] space-y-1.5 text-white">
        <div className="flex items-center gap-2">
          <Link href={authorHref} className="text-sm font-bold drop-shadow">
            {reel.author?.name ?? 'مستخدم'}
          </Link>
          <span className="text-[11px] text-white/60 drop-shadow">{timeAgo(reel.createdAt)}</span>
        </div>

        {reel.caption && (
          <p
            onClick={() => setExpanded((e) => !e)}
            className={cn(
              'cursor-pointer whitespace-pre-wrap break-words text-[13px] leading-relaxed drop-shadow',
              !expanded && 'line-clamp-2',
            )}
          >
            {reel.caption}
          </p>
        )}

        {reel.hashtags.length > 0 && (
          <p className="flex flex-wrap gap-x-2 text-[12px] font-semibold text-white/85 drop-shadow">
            {reel.hashtags.slice(0, 4).map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </p>
        )}
      </div>

      {/* progress */}
      <div className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/15">
        <div className="h-full bg-white/90 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex flex-col items-center gap-1 transition-transform disabled:cursor-default',
        onClick && 'active:scale-90',
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-black/15 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        {icon}
      </span>
      <span className={cn('text-[11px] font-semibold drop-shadow', active ? 'text-white' : 'text-white/95')}>
        {label}
      </span>
    </button>
  );
}
