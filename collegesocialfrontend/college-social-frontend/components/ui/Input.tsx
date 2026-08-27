import { InputHTMLAttributes, ReactNode, forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Helper text under the field (hidden while an error is showing). */
  hint?: string;
  /** Icon/element pinned to the leading (start) edge. */
  leading?: ReactNode;
  /** Icon/element pinned to the trailing (end) edge -- e.g. a show-password toggle. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leading, trailing, id, ...props }, ref) => {
    const reactId = useId();
    const inputId = id ?? props.name ?? reactId;
    const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-muted-foreground">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              // h-11 on phones is a comfortable touch target; text-base stops iOS from zooming
              // the viewport on focus. Tightens to h-10 / text-sm on pointer devices.
              'h-11 w-full rounded-lg border border-border bg-surface-2 px-3.5 text-base text-foreground placeholder:text-muted-foreground md:h-10 md:text-sm',
              'transition-[border-color,box-shadow,background-color] duration-fast ease-standard',
              'focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15',
              leading && 'ps-10',
              trailing && 'pe-10',
              error && 'border-danger focus:border-danger focus:ring-danger/15',
              className,
            )}
            {...props}
          />
          {trailing && (
            <span className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground">
              {trailing}
            </span>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-err`} className="text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
