import { Skeleton } from '@/components/ui/Skeleton';

// Instant placeholder for the notifications list on route transition (replaces the bare
// spinner the page shows while /notifications loads).
export default function NotificationsLoading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Skeleton className="mb-5 h-7 w-40 rounded-md" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface p-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
