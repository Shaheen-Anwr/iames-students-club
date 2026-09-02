import { Skeleton, SkeletonCard, SkeletonText } from './Skeleton';
import { cn } from '@/lib/utils';

// Shared building block for route-level `loading.tsx` files. Each route picks the `variant` that
// matches its real layout so the swap to loaded content doesn't shift (CLS budget ~0). The bespoke
// skeletons (home, feed, chat, study, reels, convert, notifications) stay as they are -- this is
// for everything else.

type Variant = 'list' | 'grid' | 'board' | 'detail' | 'profile' | 'form' | 'panels';

const MAX_W = {
  sm: 'max-w-2xl',
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
} as const;

interface RouteSkeletonProps {
  variant?: Variant;
  width?: keyof typeof MAX_W;
  /** Set false where the page has no title row of its own. */
  header?: boolean;
}

export function RouteSkeleton({ variant = 'list', width = 'lg', header = true }: RouteSkeletonProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className={cn('mx-auto w-full px-4 py-6', MAX_W[width])}>
        {header && (
          <div className="mb-5 flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-56 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
          </div>
        )}

        {variant === 'list' && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {variant === 'grid' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/80 bg-surface p-4 shadow-elev-1"
              >
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-3 w-16 rounded-md" />
                <Skeleton className="mt-1 h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {variant === 'board' && (
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          </div>
        )}

        {variant === 'detail' && (
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <SkeletonText lines={4} />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        )}

        {variant === 'profile' && (
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {variant === 'form' && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        )}

        {variant === 'panels' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}
      </div>
    </div>
  );
}
