'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { FriendActionButton } from '@/components/profile/FriendActionButton';
import { api } from '@/lib/api';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';
import type { User } from '@/lib/types';

// Right rail: "people you may know", suggested via UsersService.suggestFriends (same department,
// excluding existing friends/pending requests/blocks -- see the backend for the full rule).
export function FeedFriendSuggestionsCard() {
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  if (loading || suggestions.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-accent" /> أشخاص قد تعرفهم
      </p>
      <div className="space-y-3">
        {suggestions.map((s) => (
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
