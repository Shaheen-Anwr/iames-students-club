import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
};

// The college's emblem: a navy/gold academic seal built from an inline SVG so it
// stays crisp at any size and needs no external asset. Swap for a real logo file
// later by pointing <img> at it and dropping this component.
export function LogoMark({ size = 'md', className }: { size?: keyof typeof SIZE_CLASSES; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn(SIZE_CLASSES[size], className)} aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="#1d3557" stroke="#dca62c" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="19" fill="none" stroke="#5d81ab" strokeWidth="1" />
      <path
        d="M24 14 L38 20.5 L24 27 L10 20.5 Z"
        fill="#f8ecc9"
      />
      <path
        d="M16 23.2 V29.5 C16 31 19.5 33 24 33 C28.5 33 32 31 32 29.5 V23.2 L24 27 Z"
        fill="#dca62c"
      />
      <line x1="38" y1="20.5" x2="38" y2="28" stroke="#f8ecc9" strokeWidth="1.4" strokeLinecap="round" />
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

// Full lockup: mark + "IEAMS Students Club" wordmark + full Arabic name. Use withText={false}
// (e.g. in a compact navbar) to show just the mark.
export function Logo({ size = 'md', withText = true, variant = 'light', className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoMark size={size} />
      {withText && (
        <div className="leading-tight">
          <p className={cn('text-lg font-extrabold tracking-tight', variant === 'light' ? 'text-white' : 'text-foreground')}>
            IAEMS Students Club
          </p>
          <p className={cn('text-[11px] font-medium', variant === 'light' ? 'text-white/70' : 'text-muted-foreground')}>
            IAEMS Students Community
          </p>
        </div>
      )}
    </div>
  );
}
