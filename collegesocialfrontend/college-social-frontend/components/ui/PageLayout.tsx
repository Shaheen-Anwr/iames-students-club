import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageWidth = 'reading' | 'content' | 'wide';

const PAGE_WIDTHS: Record<PageWidth, string> = {
  reading: 'max-w-reading',
  content: 'max-w-content',
  wide: 'max-w-[1600px]',
};

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: PageWidth;
}

/** Standard page frame; place inside the app shell's existing scroll region. */
export function PageContainer({
  width = 'content',
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-page-gutter py-page-block',
        PAGE_WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}

interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

/** Shared page-level heading hierarchy with an optional action slot. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 xs:flex-row xs:items-end xs:justify-between',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="text-fluid-xs font-semibold uppercase tracking-[0.12em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="text-fluid-2xl font-bold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-reading text-fluid-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PageSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingId: string;
  children: ReactNode;
}

/** A labelled content section; headingId connects the section to its heading. */
export function PageSection({
  title,
  description,
  action,
  headingId,
  className,
  children,
  ...props
}: PageSectionProps) {
  return (
    <section aria-labelledby={headingId} className={cn('space-y-4', className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="text-fluid-lg font-semibold text-foreground">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

interface PageGridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3;
}

const PAGE_GRID_COLUMNS: Record<NonNullable<PageGridProps['columns']>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
};

/** Responsive grid for cards and dashboard content. */
export function PageGrid({ columns = 2, className, ...props }: PageGridProps) {
  return (
    <div
      className={cn('grid gap-4 md:gap-6', PAGE_GRID_COLUMNS[columns], className)}
      {...props}
    />
  );
}