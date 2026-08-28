'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { ReelFeedPage } from '@/lib/types';
import { ReelsExperience } from '@/components/reels/ReelsExperience';

export default function ReelsPage() {
  const [feed, setFeed] = useState<ReelFeedPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<ReelFeedPage>('/reels?page=1&limit=10')
      .then(setFeed)
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      {feed ? (
        <ReelsExperience initialReels={feed.data} initialHasMore={feed.hasMore} initialPage={feed.page} />
      ) : failed ? (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/70">
          تعذّر تحميل الريلز. حدّث الصفحة وحاول مرة أخرى.
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-7 w-7 text-white" />
        </div>
      )}
    </div>
  );
}
