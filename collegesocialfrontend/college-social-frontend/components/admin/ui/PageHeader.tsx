import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing controls — buttons, a range switch, etc. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Console page title row — denser than the app's `SectionHeader` and always the first thing in
 * an admin route's content. Icon chip + title (+ one-line description) + a trailing actions slot
 * that wraps below on narrow screens.
 */
export function PageHeader({ icon: Icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
