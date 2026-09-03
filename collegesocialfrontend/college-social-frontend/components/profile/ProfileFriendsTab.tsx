'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, UsersRound } from 'lucide-react';
import { PersonCard } from '@/components/friends/PersonCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { startConversationWith } from '@/lib/chat-actions';
import type { User } from '@/lib/types';

function MessageButton({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function handleClick() {
    setStarting(true);
    try {
      const conversation = await startConversationWith(targetId);
      router.push(`/chat/${conversation._id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} loading={starting} className="w-full">
      <MessageCircle className="h-3.5 w-3.5" /> مراسلة
    </Button>
  );
}

// The "Friends" tab on any profile (own or someone else's) -- see ProfileTabs. Reuses the same
// PersonCard grid as app/(app)/friends/page.tsx, but read-only here (no accept/decline/unfriend
// controls -- that management happens on the dedicated /friends page, not from someone's profile).
export function ProfileFriendsTab({ profileId, isOwn }: { profileId: string; isOwn: boolean }) {
  const { showToast } = useToast();
  const [friends, setFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<User[]>(`/users/${profileId}/friends`)
      .then((data) => {
        if (!cancelled) setFriends(data);
      })
      .catch((err) => {
        if (!cancelled) showToast(err instanceof ApiError ? err.message : 'تعذّر تحميل الأصحاب.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/80 bg-surface p-4 shadow-elev-1">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-2/40">
        <EmptyState icon={UsersRound} title="لا يوجد أصحاب بعد" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {friends.map((f) => (
        <PersonCard key={f._id} user={f} action={!isOwn ? <MessageButton targetId={f._id} /> : undefined} />
      ))}
    </div>
  );
}
