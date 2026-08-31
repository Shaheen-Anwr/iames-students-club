'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Share2, Bookmark, Play, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';
import { viaCdn } from '@/lib/media';
import { attachHls, isHls } from '@/lib/hls';
import { assetUrl, cn } from '@/lib/utils';
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

  return (
    <section className="relative h-full w-full overflow-hidden bg-black">
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
          className="absolute inset-0 h-full w-full object-contain opacity-70"
        />
      )}

      {/* readability gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/70 to-transparent" />

      {/* paused indicator */}
      {paused && active && (
        <button
          onClick={togglePlay}
          aria-label="تشغيل"
          className="absolute inset-0 z-10 grid place-items-center"
        >
          <span className="rounded-full bg-black/45 p-5 backdrop-blur-sm">
            <Play className="h-10 w-10 fill-white text-white" />
          </span>
        </button>
      )}

      {/* double-tap heart burst */}
      {burst && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <Heart className="h-28 w-28 animate-ping fill-white/90 text-white/90" />
        </div>
      )}

      {/* progress */}
      <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/15">
        <div className="h-full bg-white/85 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      {/* mute toggle */}
      <button
        onClick={onToggleMuted}
        aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        className="absolute end-3 top-3 z-30 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {canDelete && (
        <button
          onClick={onDelete}
          aria-label="حذف الريل"
          className="absolute start-3 top-3 z-30 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}

      {/* right action rail */}
      <div className="absolute bottom-24 end-2.5 z-30 flex flex-col items-center gap-5 text-white">
        <Link href={reel.author ? `/profile/${reel.author.id}` : '#'} className="mb-1">
          <Avatar src={assetUrl(reel.author?.photoUrl)} name={reel.author?.name ?? 'مستخدم'} size="md" ring />
        </Link>

        <RailButton
          label={`${reel.likeCount}`}
          onClick={onLike}
          icon={<Heart className={cn('h-7 w-7', reel.likedByMe && 'fill-rose-500 text-rose-500')} />}
        />
        <RailButton
          label={`${reel.commentCount}`}
          onClick={onOpenComments}
          icon={<MessageCircle className="h-7 w-7" />}
        />
        <RailButton
          label="مشاركة"
          onClick={onShare}
          icon={<Share2 className="h-7 w-7" />}
        />
        <RailButton
          label="حفظ"
          onClick={onSave}
          icon={<Bookmark className={cn('h-7 w-7', reel.savedByMe && 'fill-white')} />}
        />
      </div>

      {/* caption */}
      <div className="absolute bottom-24 start-3 z-20 max-w-[72%] text-white">
        <Link
          href={reel.author ? `/profile/${reel.author.id}` : '#'}
          className="text-sm font-bold drop-shadow"
        >
          {reel.author?.name ?? 'مستخدم'}
        </Link>
        {reel.caption && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed drop-shadow">
            {reel.caption}
          </p>
        )}
      </div>
    </section>
  );
}

function RailButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-90">
      <span className="drop-shadow">{icon}</span>
      <span className="text-[11px] font-semibold drop-shadow">{label}</span>
    </button>
  );
}
