import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';

// Instant placeholder for the feed's three-column layout on route transition.
export default function FeedLoading() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div aria-hidden className="bg-mesh pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative h-full overflow-y-auto scrollbar-thin">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
          <aside className="hidden lg:block">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </aside>

          <div className="min-w-0 space-y-4">
            <Skeleton className="h-14 w-full rounded-2xl" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>

          <aside className="hidden space-y-4 lg:block">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
          </aside>
        </div>
      </div>
    </div>
  );
}
