'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { Channel } from '@/lib/types';

export default function GroupDetailPage({ params }: { params: { groupId: string } }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    api.get<Channel[]>(`/groups/${params.groupId}/channels`).then((channels) => {
      if (cancelled || channels.length === 0) return;
      router.replace(`/groups/${params.groupId}/${channels[0]._id}`);
    });
    return () => {
      cancelled = true;
    };
  }, [params.groupId, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}
