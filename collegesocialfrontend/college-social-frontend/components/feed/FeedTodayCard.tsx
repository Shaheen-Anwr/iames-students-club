'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TodayWidget } from '@/components/home/TodayWidget';
import type { DashboardResponse } from '@/lib/types';

// Right rail: a peek at what's due today, surfaced on Feed too (not just Home) since students
// spend most of their time scrolling here. Stays out of the way entirely when there's nothing
// due -- unlike TodayWidget's own empty-state, which fits the always-visible Home dashboard but
// would just be clutter in a secondary rail.
export function FeedTodayCard() {
  const [data, setData] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardResponse>('/dashboard').then((res) => {
      if (!cancelled) setData(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || (data.todaySchedule.length === 0 && data.dueToday.length === 0)) return null;

  return <TodayWidget schedule={data.todaySchedule} dueToday={data.dueToday} />;
}
