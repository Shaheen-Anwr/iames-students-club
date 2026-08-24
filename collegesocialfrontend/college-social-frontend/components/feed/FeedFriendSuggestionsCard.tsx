'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { FriendActionButton } from '@/components/profile/FriendActionButton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';
import type { User } from '@/lib/types';

function dismissedKey(userId: string) {
  return `dismissed-friend-suggestions:${userId}`;
}

function readDismissed(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(dismissedKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

// Shared by the desktop sidebar card and the mobile carousel below -- both need the same
// suggestions list (UsersService.suggestFriends: same department, excluding existing
// friends/pending requests/blocks) plus a client-side "not now" dismiss that survives a reload
// without needing a backend endpoint for it.
export function useFriendSuggestions() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    setDismissed(readDismissed(user._id));
    let cancelled = false;
    api
      .get<User[]>('/users/suggestions')
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  function dismiss(id: string) {
    if (!user) return;
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try {
        window.localStorage.setItem(dismissedKey(user._id), JSON.stringify([...next]));
      } catch {
        // best-effort -- worst case the suggestion just reappears next reload
      }
      return next;
    });
  }

  // Memoized so the returned array keeps a stable reference across re-renders that don't actually
  // change the data -- callers (FriendsPage) depend on it in a useEffect, and a fresh array
  // identity every render (plain .filter() with no memo) would re-fire that effect every render,
  // which sets state, which re-renders, which... an infinite loop that pegs the tab's JS thread.
  const filtered = useMemo(() => suggestions.filter((s) => !dismissed.has(s._id)), [suggestions, dismissed]);

  return { suggestions: filtered, loading, dismiss };
}

function SuggestionRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-2.5 w-2/3 rounded-md" />
        <Skeleton className="h-2 w-1/3 rounded-md" />
      </div>
      <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
    </div>
  );
}

// Right rail: "people you may know" (desktop only -- the sidebar this lives in is hidden below
// `lg`; see FeedFriendSuggestionsCarousel for the mobile equivalent).
export function FeedFriendSuggestionsCard() {
  const { suggestions, loading } = useFriendSuggestions();

  if (!loading && suggestions.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-accent" /> أشخاص قد تعرفهم
      </p>
      <div className="space-y-3">
        {loading
          ? [0, 1, 2].map((i) => <SuggestionRowSkeleton key={i} />)
          : suggestions.map((s) => (
              <div key={s._id} className="flex items-center gap-2.5">
                <Link href={`/profile/${s._id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar src={assetUrl(s.photoUrl)} name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    {s.department && (
                      <p className="truncate text-xs text-muted-foreground">{DEPARTMENT_LABELS[s.department]}</p>
                    )}
                  </div>
                </Link>
                <FriendActionButton targetUser={s} />
              </div>
            ))}
      </div>
    </Card>
  );
}
