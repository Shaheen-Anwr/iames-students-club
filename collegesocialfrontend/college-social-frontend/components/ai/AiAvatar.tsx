'use client';

/** Friendly "student assistant" mascot: graduation cap, blinking eyes, waving hand on hover/open. */
export function AiAvatar({ size = 28, waving = false }: { size?: number; waving?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-bob overflow-visible"
      aria-hidden="true"
    >
      {/* waving hand */}
      <g
        className={waving ? 'animate-wave' : ''}
        style={{ transformOrigin: '17px 16px', transition: 'transform 0.2s ease' }}
      >
        <circle cx="18.3" cy="14.2" r="1.6" fill="white" />
      </g>

      {/* face */}
      <circle cx="12" cy="13" r="6.5" fill="white" />

      {/* graduation cap */}
      <path d="M12 3.2 4.5 6.4 12 9.6l7.5-3.2L12 3.2Z" fill="white" />
      <path d="M7 7.6v2.6c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V7.6l-5 2.1-5-2.1Z" fill="white" fillOpacity="0.75" />
      <line x1="19" y1="6.6" x2="19" y2="10.4" stroke="white" strokeWidth="0.7" strokeLinecap="round" />

      {/* eyes */}
      <g className="animate-blink" style={{ transformOrigin: 'center' }}>
        <circle cx="9.6" cy="13.1" r="1" fill="rgb(var(--accent))" />
        <circle cx="14.4" cy="13.1" r="1" fill="rgb(var(--accent))" />
      </g>

      {/* smile */}
      <path
        d="M9.8 15.4c.7.7 3.7.7 4.4 0"
        stroke="rgb(var(--accent))"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
