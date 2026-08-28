import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * For cards that are themselves clickable (a link/button, or that open something). Adds a
   * hover-lift, a deeper elevation and an accent-tinted edge on hover. Purely presentational --
   * wire the real handler on the element.
   */
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        // Elevation carries the raise now (see --elev-* in globals.css); the border is just a
        // hairline so the card seats cleanly on tinted grounds.
        'rounded-2xl border border-border/80 bg-surface shadow-elev-1',
        'transition-[box-shadow,transform,border-color] duration-200 ease-standard',
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-elev-3 active:translate-y-0 active:shadow-elev-2',
        className,
      )}
      {...props}
    />
  );
}
