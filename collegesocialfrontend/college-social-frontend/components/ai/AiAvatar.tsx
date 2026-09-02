'use client';

import { useId } from 'react';

/**
 * The assistant's mark: a four-point guiding star ("north star") inside a slow orbit ring — a
 * calm guidance metaphor. Drawn in `currentColor` (white on the gradient FAB, accent on chips)
 * so it works at every size it's used (18px avatars → 48px FAB). The halo breathes; on hover /
 * when the panel opens (`waving`) it pulses brighter and the orbit keeps drifting.
 */
export function AiAvatar({ size = 28, waving = false }: { size?: number; waving?: boolean }) {
  const gid = useId();
  const spin = { transformBox: 'fill-box', transformOrigin: 'center' } as const;

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
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft glow halo */}
      <circle
        cx="12"
        cy="12"
        r="10"
        fill={`url(#${gid})`}
        style={spin}
        className={waving ? 'motion-safe:animate-pulse' : 'motion-safe:animate-breathe'}
      />

      {/* drifting orbit + its node */}
      <g style={spin} className="motion-safe:[animation:spin_16s_linear_infinite]">
        <circle
          cx="12"
          cy="12"
          r="8.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeOpacity="0.4"
          strokeLinecap="round"
          strokeDasharray="1.4 3.6"
        />
        <circle cx="12" cy="3.4" r="1.15" fill="currentColor" />
      </g>

      {/* four-point guiding star */}
      <path
        d="M12 4.1c.6 4.3 3 6.7 7.3 7.3C15 12 12.6 14.4 12 18.7c-.6-4.3-3-6.7-7.3-7.3C9 10.8 11.4 8.4 12 4.1Z"
        fill="currentColor"
      />
      <circle cx="12" cy="11.6" r="1.3" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}
