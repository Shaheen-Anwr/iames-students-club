'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, UserRoundSearch, UsersRound } from 'lucide-react';
import { PersonCard } from '@/components/friends/PersonCard';
import { FriendActionButton } from '@/components/profile/FriendActionButton';
import { useFriendSuggestions } from '@/components/feed/FeedFriendSuggestionsCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { startConversationWith } from '@/lib/chat-actions';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

type Tab = 'friends' | 'requests' | 'suggestions';

function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="mt-1 h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof UsersRound; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2/40 py-16 text-center text-muted-foreground">
      <Icon className="h-8 w-8" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// Message button used on friend cards -- find-or-create the conversation then jump to it, same
// as profile/[id]/page.tsx's handleMessage(). Its own component (not inlined in the map below)
// so each card's "starting..." state is independent.
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

export default function FriendsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('friends');

  // A single pool of every populated User doc seen so far (from /friends + /friend-requests, and
  // suggestions as they load below), keyed by id. The three tabs then derive their actual lists by
  // filtering this pool against the *live* id arrays on the authenticated user -- so an action
  // anywhere (accept/decline/unfriend/send) that updates auth-context via updateLocalUser is
  // reflected here immediately, with no manual refetch/sync needed between tabs.
  const [pool, setPool] = useState<Record<string, User>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<User[]>(`/users/${user._id}/friends`),
      api.get<{ received: User[]; sent: User[] }>('/users/me/friend-requests'),
    ])
      .then(([friends, requests]) => {
        setPool((prev) => {
          const next = { ...prev };
          for (const u of [...friends, ...requests.received, ...requests.sent]) next[u._id] = u;
          return next;
        });
      })
      .catch((err) => showToast(err instanceof ApiError ? err.message : 'تعذّر تحميل الأصدقاء.', 'error'))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const { suggestions, loading: suggestionsLoading } = useFriendSuggestions();
  useEffect(() => {
    if (!suggestions.length) return;
    setPool((prev) => {
      const next = { ...prev };
      for (const u of suggestions) next[u._id] = u;
      return next;
    });
  }, [suggestions]);

  const friendsList = (user?.friends ?? []).map((id) => pool[id]).filter(Boolean);
  const receivedList = (user?.friendRequestsReceived ?? []).map((id) => pool[id]).filter(Boolean);
  const sentList = (user?.friendRequestsSent ?? []).map((id) => pool[id]).filter(Boolean);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'friends', label: 'الأصدقاء', count: friendsList.length || undefined },
    { id: 'requests', label: 'الطلبات', count: receivedList.length || undefined },
    { id: 'suggestions', label: 'اقتراحات' },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <UsersRound className="h-5 w-5 text-accent" /> الأصدقاء
        </h1>

        <div className="flex gap-1 border-b border-border pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                tab === t.id ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-surface-2/70 hover:text-foreground',
              )}
            >
              {t.label}
              {!!t.count && (
                <span
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                    tab === t.id ? 'bg-accent text-white' : 'bg-surface-2 text-muted-foreground',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'friends' &&
          (!loaded ? (
            <GridSkeleton />
          ) : friendsList.length === 0 ? (
            <EmptyState icon={UsersRound} text="لا يوجد أصدقاء بعد. أضف أصدقاء من الاقتراحات أدناه." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {friendsList.map((f) => (
                <PersonCard
                  key={f._id}
                  user={f}
                  action={
                    <>
                      <MessageButton targetId={f._id} />
                      <FriendActionButton targetUser={f} className="w-full" />
                    </>
                  }
                />
              ))}
            </div>
          ))}

        {tab === 'requests' &&
          (!loaded ? (
            <GridSkeleton />
          ) : receivedList.length === 0 && sentList.length === 0 ? (
            <EmptyState icon={UsersRound} text="لا توجد طلبات صداقة معلّقة." />
          ) : (
            <div className="space-y-6">
              {receivedList.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">طلبات واردة</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {receivedList.map((f) => (
                      <PersonCard key={f._id} user={f} action={<FriendActionButton targetUser={f} className="w-full" />} />
                    ))}
                  </div>
                </div>
              )}
              {sentList.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">طلبات مرسلة</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {sentList.map((f) => (
                      <PersonCard key={f._id} user={f} action={<FriendActionButton targetUser={f} className="w-full" />} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

        {tab === 'suggestions' &&
          (suggestionsLoading ? (
            <GridSkeleton />
          ) : suggestions.length === 0 ? (
            <EmptyState icon={UserRoundSearch} text="لا توجد اقتراحات حاليًا." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {suggestions.map((s) => (
                <PersonCard key={s._id} user={s} action={<FriendActionButton targetUser={s} className="w-full" />} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
