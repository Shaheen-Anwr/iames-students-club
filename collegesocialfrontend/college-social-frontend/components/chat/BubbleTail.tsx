import { cn } from '@/lib/utils';

// The little hook on the last bubble of a cluster, on the bubble's outer bottom corner (the side
// facing its sender). Drawn as a sibling *under* the bubble -- the bubble itself clips its content
// (overflow-hidden) -- overlapping it by a few px so no seam shows; that corner of the bubble is
// squared off to meet it.
//
// Own bubbles use a vertical gradient (see BubbleCard), so their bottom edge is exactly
// --accent-grad-to and the tail matches it; incoming bubbles are --chat-in.
//
// The path points toward the physical left; inline-end is left in RTL (own) and inline-start is
// right in RTL (incoming), so each side mirrors as needed.
export function BubbleTail({ isOwn, className }: { isOwn: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 11 18"
      className={cn(
        'pointer-events-none absolute bottom-0 h-[18px] w-[11px]',
        isOwn ? '-end-[7px] ltr:-scale-x-100' : '-start-[7px] rtl:-scale-x-100',
        className,
      )}
      style={{ fill: isOwn ? 'rgb(var(--accent-grad-to))' : 'rgb(var(--chat-in))' }}
    >
      <path d="M11 0C11 7 7.5 13 1.2 16.4C0.4 16.8 0.6 18 1.5 18H11Z" />
    </svg>
  );
}
