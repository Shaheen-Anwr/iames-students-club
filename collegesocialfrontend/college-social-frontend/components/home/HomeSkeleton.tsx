import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';

export function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface p-4 shadow-elev-1 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <div className="flex gap-3 sm:w-80">
          <Skeleton className="h-16 flex-1 rounded-2xl" />
          <Skeleton className="h-16 flex-1 rounded-2xl" />
        </div>
      </div>

      {/* NextClassCard */}
      <Skeleton className="h-[104px] rounded-2xl" />

      {/* TodayGlance strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-20" />
          <SkeletonText lines={4} />
        </Card>
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-24" />
          <SkeletonText lines={4} />
        </Card>
      </div>

      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </Card>
    </div>
  );
}
