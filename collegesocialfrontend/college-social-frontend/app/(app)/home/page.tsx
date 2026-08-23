'use client';

import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';
import { AnnouncementsStrip } from '@/components/announcements/AnnouncementsStrip';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { QuickActions } from '@/components/home/QuickActions';
import { TodayWidget } from '@/components/home/TodayWidget';
import { CompactLeaderboard } from '@/components/home/CompactLeaderboard';
import { MyAssignmentsCard } from '@/components/home/MyAssignmentsCard';
import { NotificationsPreview } from '@/components/home/NotificationsPreview';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import type { DashboardResponse } from '@/lib/types';

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const isProfessor = user?.role === 'professor';

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardResponse>('/dashboard').then((res) => {
      if (!cancelled) setData(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user || !data) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-5xl px-4 py-6">
          <HomeSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        <div className="animate-fade-in">
          <GreetingHeader user={user} />
        </div>

        <div className="animate-fade-in">
          <QuickActions />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <TodayWidget schedule={data.todaySchedule} dueToday={data.dueToday} />
          {isProfessor ? <MyAssignmentsCard /> : <CompactLeaderboard entries={data.leaderboard} />}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-in">
          <AnnouncementsStrip />
          <NotificationsPreview />
        </div>

        {!isProfessor && (
          <Card className="p-4 animate-fade-in">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-gold" />
                <h2 className="text-sm font-semibold text-foreground">أوسمتك</h2>
              </div>
              <Link href="/profile" className="text-xs font-medium text-muted-foreground hover:text-accent">
                عرض الملف الشخصي
              </Link>
            </div>
            <BadgeShelf badges={user.badges ?? []} />
          </Card>
        )}
      </div>
    </div>
  );
}
