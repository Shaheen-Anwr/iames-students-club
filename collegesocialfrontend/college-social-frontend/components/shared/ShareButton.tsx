'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShareContent } from '@/lib/share';
import { ShareSheet } from './ShareSheet';

interface ShareButtonProps extends ShareContent {
  /** 'icon' = bare icon button (default), 'pill' = icon + label chip. */
  variant?: 'icon' | 'pill';
  label?: string;
  heading?: string;
  className?: string;
}

export function ShareButton({
  url,
  title,
  text,
  variant = 'icon',
  label = 'مشاركة',
  heading,
  className,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={cn(
          variant === 'pill'
            ? 'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground'
            : 'inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
          className,
        )}
      >
        <Share2 className={variant === 'pill' ? 'h-4 w-4' : 'h-5 w-5'} />
        {variant === 'pill' && label}
      </button>
      <ShareSheet open={open} onClose={() => setOpen(false)} url={url} title={title} text={text} heading={heading} />
    </>
  );
}
