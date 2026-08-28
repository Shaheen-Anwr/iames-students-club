import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  /** Usually a <Button> or a link. */
  action?: ReactNode;
  className?: string;
}

/** Consistent "nothing here yet" / "no results" block -- icon, message, optional call to action. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex animate-fade-in flex-col items-center justify-center gap-3.5 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-100 to-accent-50 text-accent shadow-elev-1 ring-1 ring-inset ring-accent-200/60">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold text-foreground sm:text-base">{title}</p>
        {description && (
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  );
}
