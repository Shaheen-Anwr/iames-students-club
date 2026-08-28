import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'accent' | 'warning' | 'success' | 'gold' | 'danger';

// Tinted chip behind the leading icon -- keeps every card/section header in the same visual
// family instead of a bare 16px glyph floating next to the title.
const TONE_CLASSES: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  gold: 'bg-gold/15 text-gold',
  danger: 'bg-danger/10 text-danger',
};

interface SectionHeaderProps {
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing slot -- usually a "view all" <Link> or a small status pill. */
  action?: ReactNode;
  className?: string;
}

/**
 * The shared header for a card or a page section: an icon chip, a title (+ optional one-line
 * description) and an optional trailing action. Replaces the hand-rolled
 * `<div class="mb-3 flex items-center justify-between">…</div>` block repeated across the app.
 */
export function SectionHeader({ icon: Icon, tone = 'accent', title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE_CLASSES[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 text-xs font-medium">{action}</div>}
    </div>
  );
}
