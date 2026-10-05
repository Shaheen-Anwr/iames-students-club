'use client';

import { Download, Loader2 } from 'lucide-react';
import { cldOptimize } from '@/lib/images';
import { assetUrl, cn, formatBytes } from '@/lib/utils';
import { fileVisual } from '@/lib/chat-helpers';
import type { Attachment } from '@/lib/types';

// Photos in one message render as a WhatsApp-style album instead of a tall stack:
//   1 -> natural aspect, 2 -> side by side, 3 -> one tall + two stacked, 4+ -> 2x2 with "+N".
// `onOpen(i)` receives the index within `images`; `overlay` (time/ticks) sits on the last tile
// when the album is the whole bubble.
export function ImageAlbum({
  images,
  onOpen,
  overlay,
}: {
  images: Attachment[];
  onOpen: (index: number) => void;
  overlay?: React.ReactNode;
}) {
  const count = images.length;
  if (count === 0) return null;

  const tile = (attachment: Attachment, i: number, className: string, width: number, extra?: number) => {
    const url = assetUrl(attachment.url) ?? '';
    return (
      <button
        key={`${attachment.url}-${i}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(i);
        }}
        className={cn('group/tile relative block overflow-hidden bg-black/10', className)}
        aria-label={`فتح الصورة ${i + 1} من ${count}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cldOptimize(url, { width })}
          alt={attachment.name ?? 'صورة'}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover transition-transform duration-300 group-hover/tile:scale-[1.03]"
        />
        {extra ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-bold text-white backdrop-blur-[1px]">
            +{extra}
          </span>
        ) : null}
      </button>
    );
  };

  if (count === 1) {
    const url = assetUrl(images[0].url) ?? '';
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(0);
          }}
          className="group/tile relative block overflow-hidden rounded-[0.9rem] bg-black/10"
          aria-label="فتح الصورة بالحجم الكامل"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cldOptimize(url, { width: 900 })}
            alt={images[0].name ?? 'صورة'}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="block h-auto max-h-[min(60vh,26rem)] w-auto min-w-[9rem] max-w-[min(72vw,22rem)] object-cover transition-transform duration-300 group-hover/tile:scale-[1.02]"
          />
        </button>
        {overlay && <span className="pointer-events-none absolute bottom-1.5 end-1.5">{overlay}</span>}
      </div>
    );
  }

  const shown = images.slice(0, 4);
  const extra = count - 4;
  return (
    <div className="relative">
      <div
        className={cn(
          'grid w-[min(72vw,20rem)] gap-0.5 overflow-hidden rounded-[0.9rem]',
          count === 2 ? 'aspect-[2/1] grid-cols-2' : 'aspect-square grid-cols-2 grid-rows-2',
        )}
      >
        {count === 3
          ? [
              tile(shown[0], 0, 'row-span-2', 420),
              tile(shown[1], 1, '', 300),
              tile(shown[2], 2, '', 300),
            ]
          : shown.map((img, i) => tile(img, i, '', 300, i === 3 && extra > 0 ? extra : undefined))}
      </div>
      {overlay && <span className="pointer-events-none absolute bottom-1.5 end-1.5">{overlay}</span>}
    </div>
  );
}

export function VideoAttachment({ attachment }: { attachment: Attachment }) {
  const url = assetUrl(attachment.url) ?? '';
  return (
    <div className="relative overflow-hidden rounded-[0.9rem] bg-black" onClick={(e) => e.stopPropagation()}>
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        className="block max-h-80 w-[min(72vw,22rem)] bg-black"
      />
    </div>
  );
}

// A file card with a coloured type tile (PDF red, Word blue, ...), name, size and an open action.
export function DocumentAttachment({
  attachment,
  isOwn,
  loading,
  onOpen,
}: {
  attachment: Attachment;
  isOwn: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  const visual = fileVisual(attachment.name, attachment.mimeType);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      disabled={loading}
      className={cn(
        'flex w-[min(72vw,18rem)] items-center gap-3 rounded-[0.9rem] p-2.5 text-start transition-colors disabled:opacity-70',
        isOwn ? 'bg-black/15 hover:bg-black/20' : 'bg-foreground/[0.05] hover:bg-foreground/[0.08]',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold tracking-wide',
          isOwn ? 'bg-white/90 text-accent' : visual.tile,
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : visual.label}
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-medium">
          {attachment.name ?? 'مرفق'}
        </span>
        <span className={cn('mt-0.5 block text-xs', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
          {attachment.size != null ? formatBytes(attachment.size) : visual.label}
          {' · '}
          {loading ? 'جارٍ الفتح…' : 'اضغط للفتح'}
        </span>
      </span>
      <Download className={cn('h-4 w-4 shrink-0', isOwn ? 'text-white/80' : 'text-muted-foreground')} />
    </button>
  );
}
