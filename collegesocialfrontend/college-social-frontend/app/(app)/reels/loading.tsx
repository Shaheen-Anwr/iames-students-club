import { Spinner } from '@/components/ui/Spinner';

// Instant full-screen black placeholder while the reels route mounts (matches the immersive
// takeover in ReelsExperience so there's no chrome flash).
export default function ReelsLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <Spinner className="h-7 w-7 text-white" />
    </div>
  );
}
