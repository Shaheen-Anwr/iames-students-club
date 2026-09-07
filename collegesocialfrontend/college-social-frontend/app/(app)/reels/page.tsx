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

  if (feed) {
    return <ReelsExperience initialReels={feed.data} initialHasMore={feed.hasMore} initialPage={feed.page} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-8 text-center">
      {failed ? (
        <p className="text-sm text-white/70">تعذّر تحميل الريلز. حدّث الصفحة وحاول مرة أخرى.</p>
      ) : (
        <Spinner className="h-7 w-7 text-white" />
      )}
    </div>
  );
}
