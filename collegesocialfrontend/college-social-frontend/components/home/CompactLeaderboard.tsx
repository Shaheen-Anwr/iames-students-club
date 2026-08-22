'use client';

import Link from 'next/link';
import { Crown, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import { assetUrl, cn } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/types';

const MEDAL_STYLES = [
  'bg-gradient-to-br from-gold to-gold/70 text-background shadow-glow',
  'bg-gold/25 text-gold ring-1 ring-gold/30',
  'bg-gold/15 text-gold ring-1 ring-gold/20',
];

export function CompactLeaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const { user } = useAuth();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold text-foreground">المتصدرون</h2>
        </div>
        <Link href="/study/leaderboard" className="text-xs font-medium text-muted-foreground hover:text-accent">
          عرض الكل
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد نشاط بعد.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, index) => {
            const isMe = entry._id === user?._id;
            return (
              <div
                key={entry._id}
                className={cn('flex items-center gap-2.5 rounded-xl px-2 py-1.5', isMe && 'bg-accent/5')}
              >
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    index < 3 ? MEDAL_STYLES[index] : 'bg-surface-2 text-muted-foreground',
                  )}
                >
                  {index === 0 ? <Crown className="h-3 w-3" /> : index + 1}
                </div>
                <Avatar src={assetUrl(entry.photoUrl)} name={entry.name} size="xs" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {entry.name}
                  {isMe && <span className="ms-1 text-xs text-accent">(أنت)</span>}
                </p>
                <p className="shrink-0 text-xs font-semibold text-accent">{entry.points}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
