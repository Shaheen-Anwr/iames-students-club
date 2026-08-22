'use client';

/**
 * Soft drifting gradient wash behind the AI surfaces (Aurora Glass look). Purely decorative --
 * absolutely positioned behind content (-z-10), so the parent must be `relative` (and usually
 * `overflow-hidden`, or rely on an ancestor that already clips). Freezes under
 * prefers-reduced-motion via `motion-safe:`, leaving two calm static blobs instead.
 */
export function AiAuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -start-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-accent/25 blur-3xl motion-safe:animate-aurora-1" />
      <div className="absolute -end-1/4 -bottom-1/4 h-2/3 w-2/3 rounded-full bg-accent-2/20 blur-3xl motion-safe:animate-aurora-2" />
    </div>
  );
}
