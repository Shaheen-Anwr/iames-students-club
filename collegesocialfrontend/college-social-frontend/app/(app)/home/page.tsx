'use client';

import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/lib/notifications-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BadgeShelf } from '@/components/gamification/BadgeShelf';
import { AnnouncementsStrip } from '@/components/announcements/AnnouncementsStrip';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { QuickActions } from '@/components/home/QuickActions';
import { NextClassCard } from '@/components/home/NextClassCard';
import { TodayGlance } from '@/components/home/TodayGlance';
import { OnlineNow } from '@/components/home/OnlineNow';
import { TodayWidget } from '@/components/home/TodayWidget';
import { CompactLeaderboard } from '@/components/home/CompactLeaderboard';
import { MyAssignmentsCard } from '@/components/home/MyAssignmentsCard';
import { NotificationsPreview } from '@/components/home/NotificationsPreview';
import { WeeklyRecapCard } from '@/components/home/WeeklyRecapCard';
import { SinceLastSeen } from '@/components/home/SinceLastSeen';
import { ReferralCard } from '@/components/home/ReferralCard';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { buildNudge, classPhase } from '@/lib/today';
import type { DashboardResponse } from '@/lib/types';

export default function HomePage() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const isProfessor = user?.role === 'professor';

  const { data, refetch } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardResponse>('/dashboard'),
  });

  if (!user || !data) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-5xl px-4 py-6">
          <HomeSkeleton />
        </div>
      </div>
    );
  }

  const nudge = isProfessor
    ? null
    : buildNudge({
        phase: classPhase(data.todaySchedule),
        dueToday: data.dueToday,
        unreadCount,
        streak: user.streakCount ?? 0,
      });

  return (
    <PullToRefresh onRefresh={() => refetch()} className="min-h-0 flex-1 scrollbar-thin">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        {/* Sections rise in gently in sequence rather than all snapping in at once. */}
        <div className="animate-slide-up" style={{ animationDelay: '0ms' }}>
          <GreetingHeader user={user} nudge={nudge} />
        </div>

        {!isProfessor && (
          <div className="animate-slide-up space-y-3" style={{ animationDelay: '40ms' }}>
            <SinceLastSeen />
            <WeeklyRecapCard />
          </div>
        )}

        <div className="animate-slide-up" style={{ animationDelay: '60ms' }}>
          <NextClassCard schedule={data.todaySchedule} />
        </div>

        <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
          <TodayGlance schedule={data.todaySchedule} dueToday={data.dueToday} streak={user.streakCount ?? 0} />
        </div>

        {!isProfessor && (
          <div className="animate-slide-up" style={{ animationDelay: '160ms' }}>
            <OnlineNow />
          </div>
        )}

        <div className="animate-slide-up" style={{ animationDelay: '180ms' }}>
          <QuickActions />
        </div>

        <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '240ms' }}>
          <TodayWidget schedule={data.todaySchedule} dueToday={data.dueToday} />
          {isProfessor ? <MyAssignmentsCard /> : <CompactLeaderboard entries={data.leaderboard} />}
        </div>

        <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '300ms' }}>
          <AnnouncementsStrip />
          <NotificationsPreview />
        </div>

        {!isProfessor && (
          <div className="grid animate-slide-up grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '360ms' }}>
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
    </PullToRefresh>
  );
}
