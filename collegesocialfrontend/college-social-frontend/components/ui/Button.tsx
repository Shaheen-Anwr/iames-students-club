import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'subtle' | 'outline' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Stretch to the container width -- the common case for mobile primary actions. */
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-gradient-accent text-white shadow-elev-1 hover:shadow-glow active:brightness-95',
  secondary: 'bg-accent text-white shadow-elev-1 hover:brightness-105 active:brightness-95',
  // Tonal fill -- reads as a real button but calmer than the accent fill. The ramp inverts
  // between themes so accent-100 / accent-800 stay legible in both light and dark.
  subtle: 'bg-accent-100 text-accent-800 hover:bg-accent-200 active:bg-accent-200',
  outline: 'border border-strong bg-surface text-foreground hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground active:bg-surface-3',
  danger: 'bg-danger text-white shadow-elev-1 hover:brightness-105 active:brightness-95',
};

// md / lg / icon clear a 40px＋ touch target; sm / xs are for dense desktop toolbars and inline
// actions where a fingertip isn't the primary input.
const sizeClasses: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs rounded-md gap-1',
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', loading, fullWidth, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          // touch-manipulation kills the 300ms tap delay; the tap-highlight reset stops the
          // grey flash on Android Chrome. Only transform/shadow/filter animate, so the press
          // stays smooth on low-end phones. Keyboard focus uses the global :focus-visible ring.
          'inline-flex select-none items-center justify-center font-medium touch-manipulation',
          '[-webkit-tap-highlight-color:transparent] transition-[transform,box-shadow,filter,background-color] duration-fast ease-standard',
          'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
          fullWidth && 'w-full',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
