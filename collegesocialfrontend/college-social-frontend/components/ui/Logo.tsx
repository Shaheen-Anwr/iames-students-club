import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
};

// The club's emblem ("Ascent Orbit"): students connect and revolve around a bright community
// core on an indigo->amber orbital ring, then rise along a linked path of milestones to a
// spark -- social + chat (the linked nodes), study + schedule (the path), achievement +
// streaks (the spark). Social network first, study second. Inline SVG so it stays crisp at
// any size with no external asset. This is a JSX mirror of app/icon.svg (the favicon) which
// also drives the PWA icons in public/icons via scripts/generate-pwa-icons.mjs -- keep the
// geometry in sync.
//
// The <defs> ids below are static: if two marks render on one page the ids collide, but
// every definition is byte-identical so the browser resolving to the first is harmless.
export function LogoMark({
  size = 'md',
  mono = false,
  className,
}: {
  size?: keyof typeof SIZE_CLASSES;
  // Flat single-colour variant (inherits currentColor, no tile) for tight or low-contrast spots.
  mono?: boolean;
  className?: string;
}) {
  if (mono) {
    return (
      <svg viewBox="0 0 48 48" className={cn(SIZE_CLASSES[size], className)} fill="none" aria-hidden="true">
        <ellipse
          cx="24"
          cy="24"
          rx="13.5"
          ry="8.4"
          transform="rotate(-32 24 24)"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        <path
          d="M12.4 31.6 L24 24 L30.2 18.4 L35.5 12.8"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="24" r="5.2" fill="currentColor" />
        <circle cx="12.4" cy="31.6" r="2.7" fill="currentColor" />
        <path
          d="M35.5 8.6 L37 11.3 L39.7 12.8 L37 14.3 L35.5 17 L34 14.3 L31.3 12.8 L34 11.3 Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" className={cn(SIZE_CLASSES[size], className)} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logo-ring" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B7CFF" />
          <stop offset="1" stopColor="#F7B733" />
        </linearGradient>
        <radialGradient id="logo-core" cx="0.5" cy="0.42" r="0.6">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C9D2FF" />
        </radialGradient>
        <linearGradient id="logo-sheen" x1="4" y1="0" x2="20" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="#141520" />
      <rect width="48" height="48" rx="13" fill="url(#logo-sheen)" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="12.25" stroke="#FFFFFF" strokeOpacity="0.06" />
      <circle cx="35.5" cy="12.8" r="7" fill="#F7B733" opacity="0.16" />
      <ellipse
        cx="24"
        cy="24"
        rx="13.5"
        ry="8.4"
        transform="rotate(-32 24 24)"
        stroke="url(#logo-ring)"
        strokeWidth="2.6"
      />
      <path
        d="M12.4 31.6 L24 24 L30.2 18.4 L35.5 12.8"
        stroke="url(#logo-ring)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="9" fill="#141520" />
      <circle cx="24" cy="24" r="5.2" fill="url(#logo-core)" />
      <circle cx="12.4" cy="31.6" r="2.7" fill="#8B7CFF" />
      <circle cx="30.2" cy="18.4" r="2.1" fill="#FBCB6E" />
      <path
        d="M35.5 8.6 L37 11.3 L39.7 12.8 L37 14.3 L35.5 17 L34 14.3 L31.3 12.8 L34 11.3 Z"
        fill="#F7B733"
      />
    </svg>
  );
}

interface LogoProps {
  size?: keyof typeof SIZE_CLASSES;
  withText?: boolean;
  // "light" text suits dark backgrounds (navy panels); "dark" suits white/light cards.
  variant?: 'light' | 'dark';
  className?: string;
}

// Full lockup: mark + "IAEMS Students Club" wordmark + community line. Use withText={false}
// (e.g. in a compact navbar) to show just the mark.
export function Logo({ size = 'md', withText = true, variant = 'light', className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark size={size} />
      {withText && (
        <div className="leading-tight">
          <p
            className={cn(
              'text-lg font-extrabold tracking-tight',
              variant === 'light' ? 'text-white' : 'text-foreground',
            )}
          >
            IAEMS Students Club
          </p>
          <p
            className={cn(
              'text-[11px] font-medium',
              variant === 'light' ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            IAEMS Students Community
          </p>
        </div>
      )}
    </div>
  );
}
