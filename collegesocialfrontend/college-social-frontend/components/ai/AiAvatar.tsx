'use client';

import { useId } from 'react';

/**
 * The assistant's mark: a faceted "spark prism" — a cut-gem hexagon with a four-point AI spark at
 * its core and a small orbiting sparkle. Drawn in `currentColor` (white on the gradient FAB,
 * accent on chips) with layered opacity facets so it reads as premium at any size. Gently bobs;
 * the core twinkles on hover / when the panel opens (`waving`).
 */
export function AiAvatar({ size = 28, waving = false }: { size?: number; waving?: boolean }) {
  const gid = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-bob overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* gem body */}
      <path
        d="M12 2.5 20.5 7.2V16.8L12 21.5 3.5 16.8V7.2L12 2.5Z"
        fill={`url(#${gid})`}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* crown + pavilion facets */}
      <path d="M12 2.5 20.5 7.2 12 11.9 3.5 7.2 12 2.5Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M3.5 7.2 12 11.9V21.5L3.5 16.8V7.2Z" fill="currentColor" fillOpacity="0.1" />

      {/* core AI spark */}
      <path
        d="M12 8.4c.4 2.7 1.5 3.8 4.2 4.2-2.7.4-3.8 1.5-4.2 4.2-.4-2.7-1.5-3.8-4.2-4.2 2.7-.4 3.8-1.5 4.2-4.2Z"
        fill="currentColor"
        className={waving ? 'origin-center motion-safe:animate-pulse' : ''}
        style={{ transformOrigin: '12px 12.6px' }}
      />

      {/* orbiting sparkle */}
      <path
        d="M17.6 6.6c.16 1.05.56 1.45 1.6 1.6-1.04.16-1.44.56-1.6 1.6-.16-1.04-.56-1.44-1.6-1.6 1.04-.15 1.44-.55 1.6-1.6Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
    </svg>
  );
}
