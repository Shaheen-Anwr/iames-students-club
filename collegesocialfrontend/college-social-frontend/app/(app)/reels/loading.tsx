import { Spinner } from '@/components/ui/Spinner';

// Instant black placeholder while the reels route mounts.
export default function ReelsLoading() {
  return (
    <div className="relative min-h-0 flex-1 bg-black">
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-7 w-7 text-white" />
      </div>
    </div>
  );
}
