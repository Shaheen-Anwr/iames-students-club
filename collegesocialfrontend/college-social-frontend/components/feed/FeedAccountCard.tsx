'use client';

import Link from 'next/link';
import { ChevronLeft, Flame, ShieldCheck, Star } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import { DEPARTMENT_LABELS } from '@/lib/departments';
import { assetUrl } from '@/lib/utils';

// Right rail: the signed-in user's account embedded as a real card (avatar, department,
// stats) instead of just a link/icon, matching the pattern used for the AI chat and chats cards.
export function FeedAccountCard() {
  const { user } = useAuth();
  if (!user) return null;

  const hasStats = !!(user.points || user.streakCount);

  return (
    <Card className="p-4 transition-shadow hover:shadow-card">
      <Link href="/profile" className="flex items-center gap-3">
        <Avatar src={assetUrl(user.photoUrl)} name={user.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
          {user.department && (
            <p className="truncate text-xs text-muted-foreground">{DEPARTMENT_LABELS[user.department]}</p>
          )}
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {hasStats && (
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {!!user.points && (
            <span className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-accent" />
              {user.points} نقطة
            </span>
          )}
          {!!user.streakCount && (
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-accent" />
              {user.streakCount} يوم متتالي
            </span>
          )}
        </div>
      )}

      {user.role === 'admin' && (
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-2.5 rounded-lg border-t border-border px-2 pt-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          <ShieldCheck className="h-4 w-4 text-accent" />
          لوحة الإدارة
        </Link>
      )}
    </Card>
  );
}
