import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/** Toolbar + N shimmer rows inside a card — the loading state for every console table page. */
export function TableSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-elev-1">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3 w-32" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className={cn('h-3 flex-1', i % 2 ? 'max-w-[45%]' : 'max-w-[70%]')} />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** KPI row + chart blocks — the loading state for the Overview dashboard. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-elev-1">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="mt-3 h-6 w-16" />
            <Skeleton className="mt-2 h-2.5 w-20" />
            <Skeleton className="mt-3 h-8 w-full rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

/** Full-shell placeholder for `admin/loading.tsx` (sidebar rail + topbar + content). */
export function ConsoleSkeleton() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden w-60 shrink-0 border-e border-border bg-surface p-3 lg:block">
        <Skeleton className="mb-4 h-8 w-32" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="mb-1.5 h-8 w-full rounded-lg" />
        ))}
      </div>
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="mt-4">
          <DashboardSkeleton />
        </div>
      </div>
    </div>
  );
}
