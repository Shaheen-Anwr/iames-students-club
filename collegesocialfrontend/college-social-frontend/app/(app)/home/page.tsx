'use client';

import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';
import { AnnouncementsStrip } from '@/components/announcements/AnnouncementsStrip';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { QuickActions } from '@/components/home/QuickActions';
import { TodayWidget } from '@/components/home/TodayWidget';
import { CompactLeaderboard } from '@/components/home/CompactLeaderboard';
import { MyAssignmentsCard } from '@/components/home/MyAssignmentsCard';
import { NotificationsPreview } from '@/components/home/NotificationsPreview';
import { ReferralCard } from '@/components/home/ReferralCard';
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
        {/* Sections rise in gently in sequence rather than all snapping in at once. */}
        <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
          <GreetingHeader user={user} />
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
          <QuickActions />
        </div>

        <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '120ms' }}>
          <TodayWidget schedule={data.todaySchedule} dueToday={data.dueToday} />
          {isProfessor ? <MyAssignmentsCard /> : <CompactLeaderboard entries={data.leaderboard} />}
        </div>

        <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '180ms' }}>
          <AnnouncementsStrip />
          <NotificationsPreview />
        </div>

        {!isProfessor && (
          <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '240ms' }}>
            <ReferralCard />
            <Card className="p-4">
              <SectionHeader
                icon={Award}
                tone="gold"
                title="أوسمتك"
                action={
                  <Link href="/profile" className="text-muted-foreground hover:text-accent">
                    عرض الملف الشخصي
                  </Link>
                }
              />
              <BadgeShelf badges={user.badges ?? []} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
