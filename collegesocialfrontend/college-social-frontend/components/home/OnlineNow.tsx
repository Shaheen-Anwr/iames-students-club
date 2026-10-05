'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/auth-context';
import { assetUrl } from '@/lib/utils';

interface OnlineUser {
  _id: string;
  name: string;
  photoUrl: string | null;
  role: string;
}

// "Your friends online right now" -- a small social-presence nudge on the home screen.
// Renders nothing when nobody's online (never an empty widget). Refreshes every 30s.
export function OnlineNow() {
  const { user } = useAuth();
  // Path is validated against the generated OpenAPI paths (lib/api-typed) -- a renamed/removed
  // route is a compile error, not a runtime 404.
  const { data = [] } = useApiQuery<'/users/online', OnlineUser[]>('/users/online?limit=20', {
    key: ['online-friends', user?._id],
    enabled: !!user,
    refetchInterval: 30_000,
  });
  // Also filter the cached response so removing/blocking a friend hides them immediately.
  const users = data.filter((person) => user?.friends?.includes(person._id) && !user.blockedUsers?.includes(person._id));

  if (users.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-surface px-4 py-3 shadow-elev-1">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" />
        <p className="text-xs font-medium text-muted-foreground">
          {users.length} من أصحابك متصلون الآن
        </p>
        <Link href="/rooms" className="ms-auto text-[11px] font-medium text-accent hover:underline">
          ادعُهم لغرفة مذاكرة
        </Link>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {users.slice(0, 14).map((u) => (
          <div key={u._id} className="flex flex-col items-center gap-1">
            <div className="relative">
              <Avatar src={assetUrl(u.photoUrl)} name={u.name} size="sm" />
              <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
            </div>
            <span className="max-w-[52px] truncate text-[10px] text-muted-foreground">{u.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
