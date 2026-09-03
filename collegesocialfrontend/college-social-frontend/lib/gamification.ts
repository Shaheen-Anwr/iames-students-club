'use client';

import { useApiQuery } from '@/lib/query';

export interface GamificationSummary {
  points: number;
  weeklyPoints: number;
  streakCount: number;
  streakFreezes: number;
  lastFreezeUsedAt: string | null;
}

// Live gamification stats for the signed-in user -- streak/points/freezes + the "we just saved
// your streak" signal. Kept separate from the /users/me auth doc so the streak pill and the
// leaderboard header can refresh it on its own cadence without a full auth refresh.
export function useGamificationSummary(enabled = true) {
  return useApiQuery<'/gamification/me', GamificationSummary>('/gamification/me', {
    key: ['/gamification/me'],
    enabled,
    staleTime: 60_000,
  });
}

export interface WeeklyRecap {
  weekStart: string;
  totalPoints: number;
  activeDays: number;
  posts: number;
  comments: number;
  reactions: number;
  quizzes: number;
  assignments: number;
  streakCount: number;
  freezesUsed: number;
  deptRank: number | null;
}

// Last week's activity summary, for the home "أسبوعك" card. Cheap enough to leave on a long
// stale time -- it only changes once a week.
export function useWeeklyRecap(enabled = true) {
  return useApiQuery<'/gamification/recap', WeeklyRecap>('/gamification/recap', {
    key: ['/gamification/recap'],
    enabled,
    staleTime: 30 * 60_000,
  });
}
