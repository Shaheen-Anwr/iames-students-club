'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { Reel, ReelFeedPage } from '@/lib/types';
import { ReelsExperience } from '@/components/reels/ReelsExperience';

// Deep link: start the vertical feed on a specific reel, then continue into the newest-first feed
// below it.
export default function ReelDeepLinkPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<Reel>(`/reels/${id}`),
      api.get<ReelFeedPage>('/reels?page=1&limit=10').catch(() => ({ data: [], hasMore: false, page: 1, limit: 10 })),
    ])
      .then(([single, page]) => {
        setReels([single, ...page.data.filter((r) => r.id !== single.id)]);
        setHasMore(page.hasMore);
      })
      .catch(() => setFailed(true));
  }, [id]);

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      {reels ? (
        <ReelsExperience initialReels={reels} initialHasMore={hasMore} initialPage={1} />
      ) : failed ? (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/70">
          هذا الريل غير متاح.
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-7 w-7 text-white" />
        </div>
      )}
    </div>
  );
}
