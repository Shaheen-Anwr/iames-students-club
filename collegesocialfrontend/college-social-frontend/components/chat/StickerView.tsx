'use client';

import { memo, type CSSProperties } from 'react';
import { resolveSticker } from '@/lib/chat-stickers';
import type { TextSticker } from '@/lib/text-stickers';
import { cn } from '@/lib/utils';

// One sticker at a given box size: the artwork packs and user-made images as <img>, the Arabic
// text stickers drawn with CSS in the app font, and the first emoji-only packs as a big glyph.
export const StickerView = memo(function StickerView({
  url,
  name,
  size,
  className,
}: {
  url: string;
  name?: string | null;
  size: number;
  className?: string;
}) {
  const sticker = resolveSticker(url, name);
  if (sticker.kind === 'text') return <TextStickerArt sticker={sticker.sticker} size={size} className={className} />;
  if (sticker.kind === 'emoji') {
    return (
      <span
        role="img"
        aria-label={sticker.label}
        title={sticker.label}
        className={cn('flex select-none items-center justify-center leading-none drop-shadow-md', className)}
        style={{ width: size, height: size, fontSize: size * 0.78 }}
      >
        {sticker.emoji}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sticker.src}
      alt={sticker.label}
      title={sticker.label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn('select-none object-contain drop-shadow-[0_2px_4px_rgb(0_0_0/0.18)]', className)}
      style={{ width: size, height: size }}
    />
  );
});

// White "sticker cut" outline around text: eight hard shadows + one soft drop.
function outline(width: number, tint = 'rgb(0 0 0 / 0.25)'): string {
  const w = Math.max(1, Math.round(width));
  const offsets = [
    [w, 0], [-w, 0], [0, w], [0, -w], [w, w], [-w, -w], [w, -w], [-w, w],
  ];
  return [...offsets.map(([x, y]) => `${x}px ${y}px 0 #fff`), `0 ${w * 2}px ${w * 3}px ${tint}`].join(', ');
}

export function TextStickerArt({ sticker, size, className }: { sticker: TextSticker; size: number; className?: string }) {
  const [from, to] = sticker.colors;
  const long = sticker.text.length > 9;
  const fontSize = size * (long ? 0.135 : 0.17);
  const box: CSSProperties = { width: size, height: size, transform: `rotate(${sticker.tilt ?? 0}deg)` };

  return (
    <span
      role="img"
      aria-label={sticker.text}
      title={sticker.text}
      className={cn('relative flex select-none flex-col items-center justify-center text-center font-black leading-tight', className)}
      style={box}
    >
      {sticker.style === 'pop' && (
        <span
          className="flex max-w-full flex-col items-center gap-[0.15em] rounded-[1.1em] text-white [text-wrap:balance]"
          style={{
            fontSize,
            padding: '0.45em 0.7em',
            background: `linear-gradient(160deg, ${from}, ${to})`,
            border: `${Math.max(2, size * 0.028)}px solid #fff`,
            boxShadow: `0 ${size * 0.03}px ${size * 0.07}px rgb(0 0 0 / 0.28)`,
            textShadow: '0 1px 2px rgb(0 0 0 / 0.25)',
          }}
        >
          {sticker.emoji && <span style={{ fontSize: '1.15em', lineHeight: 1 }}>{sticker.emoji}</span>}
          <span>{sticker.text}</span>
        </span>
      )}

      {sticker.style === 'outline' && (
        <span className="flex max-w-full flex-col items-center [text-wrap:balance]" style={{ fontSize: fontSize * 1.12, color: from, textShadow: outline(size * 0.022) }}>
          {sticker.emoji && <span style={{ fontSize: '1.2em', lineHeight: 1.1, textShadow: 'none', filter: 'drop-shadow(0 2px 2px rgb(0 0 0 / 0.25))' }}>{sticker.emoji}</span>}
          <span>{sticker.text}</span>
        </span>
      )}

      {sticker.style === 'note' && (
        <span
          className="relative flex aspect-square w-[82%] flex-col items-center justify-center gap-[0.2em] text-[#3b2f0b] [text-wrap:balance]"
          style={{
            fontSize,
            padding: '0.6em',
            background: `linear-gradient(170deg, ${from}, ${to})`,
            boxShadow: `0 ${size * 0.035}px ${size * 0.06}px rgb(0 0 0 / 0.25)`,
            borderRadius: size * 0.03,
          }}
        >
          {/* tape */}
          <span
            aria-hidden
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] bg-white/70"
            style={{ width: size * 0.34, height: size * 0.09, boxShadow: '0 1px 2px rgb(0 0 0 / 0.12)' }}
          />
          {sticker.emoji && <span style={{ fontSize: '1.2em', lineHeight: 1 }}>{sticker.emoji}</span>}
          <span>{sticker.text}</span>
        </span>
      )}

      {sticker.style === 'badge' && (
        <span
          className="flex aspect-square w-[86%] flex-col items-center justify-center gap-[0.1em] rounded-full text-white [text-wrap:balance]"
          style={{
            fontSize,
            padding: '0.5em',
            background: `radial-gradient(circle at 30% 25%, ${from}, ${to})`,
            border: `${Math.max(2, size * 0.03)}px solid #fff`,
            boxShadow: `0 ${size * 0.03}px ${size * 0.07}px rgb(0 0 0 / 0.28), inset 0 0 0 ${Math.max(1, size * 0.018)}px rgb(255 255 255 / 0.35)`,
            textShadow: '0 1px 2px rgb(0 0 0 / 0.25)',
          }}
        >
          {sticker.emoji && <span style={{ fontSize: '1.3em', lineHeight: 1 }}>{sticker.emoji}</span>}
          <span>{sticker.text}</span>
        </span>
      )}
    </span>
  );
}
