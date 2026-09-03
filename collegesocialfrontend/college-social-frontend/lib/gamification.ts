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

export type ActivityReason = 'post_created' | 'reel_created' | 'quiz_attempted' | 'assignment_completed';

export interface FriendActivityItem {
  actor: { _id: string; name: string; photoUrl: string | null };
  reason: ActivityReason;
  meta: { postId?: string; quizId?: string; assignmentId?: string; reelId?: string; courseCode?: string | null } | null;
  createdAt: string;
}

// Recent activity by the signed-in student's friends (home "نشاط الأصدقاء" card).
export function useFriendActivity(enabled = true) {
  return useApiQuery<'/gamification/friend-activity', FriendActivityItem[]>('/gamification/friend-activity', {
    key: ['/gamification/friend-activity'],
    enabled,
    staleTime: 3 * 60_000,
  });
}
