'use client';

import { useEffect, useState } from 'react';
import { Crown, Flame, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { assetUrl, cn } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/types';

const MEDAL_STYLES = [
  'bg-gradient-to-br from-gold to-gold/70 text-background shadow-glow', // 1st
  'bg-gold/25 text-gold ring-1 ring-gold/30', // 2nd
  'bg-gold/15 text-gold ring-1 ring-gold/20', // 3rd
];

const RANK_CARD_STYLES = ['border-gold/40 bg-gold/5'];

export function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<LeaderboardEntry[]>('/users/leaderboard?limit=20')
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-border bg-surface-2/40">
        <EmptyState icon={Trophy} title="لا يوجد نشاط بعد" description="سيظهر المتصدرون هنا بمجرد بدء النشاط." />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <h1 className="mb-1 flex items-center gap-2.5 text-lg font-semibold text-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <Trophy className="h-4 w-4" />
        </span>
        المتصدرون
      </h1>
      {entries.map((entry, index) => {
        const isMe = entry._id === user?._id;
        return (
          <Card
            key={entry._id}
            className={cn(
              'flex items-center gap-3 p-3.5',
              index === 0 && RANK_CARD_STYLES[0],
              isMe && 'border-accent/40 bg-accent/5',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                index < 3 ? MEDAL_STYLES[index] : 'bg-surface-2 text-muted-foreground',
              )}
            >
              {index === 0 ? <Crown className="h-4 w-4" /> : index + 1}
            </div>
            <Avatar src={assetUrl(entry.photoUrl)} name={entry.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {entry.name}
                {isMe && <span className="ms-1.5 text-xs text-accent">(أنت)</span>}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Flame className="h-3 w-3 text-warning" />
                {entry.streakCount} يوم متتالي
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className={cn('text-sm font-bold', index === 0 ? 'text-gold' : 'text-accent')}>{entry.points}</p>
              <p className="text-[10px] text-muted-foreground">نقطة</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
