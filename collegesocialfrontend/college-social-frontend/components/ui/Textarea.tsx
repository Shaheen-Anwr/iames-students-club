import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground md:text-sm',
          'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
