import { HomeSkeleton } from '@/components/home/HomeSkeleton';

// Shown instantly on navigation to /home while the route's JS + first /dashboard fetch land,
// so the tab switch never dead-ends on a blank <main>. Mirrors the in-page loading state.
export default function HomeLoading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <HomeSkeleton />
      </div>
    </div>
  );
}
