import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          // text-base keeps iOS from zooming on focus; matches the Input focus treatment.
          'w-full resize-none rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground md:text-sm',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-standard',
          'focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
