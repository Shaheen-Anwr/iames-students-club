import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-gradient-accent text-white shadow-soft hover:shadow-glow',
  secondary: 'bg-accent text-white hover:opacity-90 shadow-soft',
  outline: 'border border-border bg-surface text-foreground hover:bg-surface-2',
  ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
  danger: 'bg-danger text-white hover:opacity-90',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
