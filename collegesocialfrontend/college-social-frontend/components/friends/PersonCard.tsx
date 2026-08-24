import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';
import type { User } from '@/lib/types';

interface PersonCardProps {
  user: Pick<User, '_id' | 'name' | 'photoUrl' | 'department'>;
  action?: ReactNode;
}

// Shared by the /friends page's three tabs and the profile "Friends" tab -- one grid cell:
// avatar, name, department, and a slot for whatever action makes sense in that list
// (FriendActionButton, a message button, or both).
export function PersonCard({ user, action }: PersonCardProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface p-4 text-center shadow-soft transition-shadow hover:shadow-card">
      <Link href={`/profile/${user._id}`} className="flex flex-col items-center gap-2.5">
        <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="lg" />
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-foreground">{user.name}</p>
          {user.department && <p className="line-clamp-1 text-xs text-muted-foreground">{DEPARTMENT_LABELS[user.department]}</p>}
        </div>
      </Link>
      {action && <div className="mt-1 flex w-full flex-col gap-1.5">{action}</div>}
    </div>
  );
}
