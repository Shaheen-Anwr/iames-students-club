'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/lib/notifications-context';
import { api } from '@/lib/api';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { SinceLastSeen } from '@/components/home/SinceLastSeen';
import { FirstWeekChecklist } from '@/components/onboarding/FirstWeekChecklist';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { useRawQuery } from '@/lib/query';
import { buildNudge, classPhase } from '@/lib/today';
import { getEffectiveOrder, type HomeLayoutPrefs, type WidgetContext } from '@/lib/home-widgets';
import type { DashboardResponse } from '@/lib/types';

export default function HomePage() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const isProfessor = user?.role === 'professor';

  const { data, refetch } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardResponse>('/dashboard'),
  });

  // Undefined while loading (never customized OR request in flight) -- getEffectiveOrder treats
  // both the same way, falling back to the smart default order, so there's no extra loading gate
  // needed here beyond the existing `!data` one below.
  const { data: layoutPrefs } = useRawQuery<HomeLayoutPrefs>(['home-layout'], '/users/me/home-layout', {
    enabled: !!user,
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

  const ctx: WidgetContext = { user, data, nudge, unreadCount, now: new Date() };
  const widgets = getEffectiveOrder(layoutPrefs ?? null, ctx);

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
            <FirstWeekChecklist />
          </div>
        )}

        {/* Everything below is customizable -- see profile > "تخصيص الرئيسية"
            (components/profile/CustomizeHomeCard.tsx) and lib/home-widgets.tsx's registry. Half-
            width widgets pack two-per-row via CSS Grid auto-flow in the user's own order; full-width
            ones (col-span-2) break to their own row. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {widgets.map((w, i) => {
            const Component = w.component;
            const props = w.propsSelector?.(ctx) ?? {};
            return (
              <div
                key={w.id}
                className={w.span === 'full' ? 'animate-slide-up lg:col-span-2' : 'animate-slide-up'}
                style={{ animationDelay: `${Math.min(60 + i * 30, 400)}ms` }}
              >
                <Component {...props} />
              </div>
            );
          })}
        </div>
      </div>
    </PullToRefresh>
  );
}
