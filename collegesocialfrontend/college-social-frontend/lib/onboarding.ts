'use client';

import { useRawQuery } from '@/lib/query';

export type ChecklistKey = 'set_department' | 'enable_push' | 'add_friend' | 'join_group' | 'first_post';

export interface OnboardingState {
  completedAt: string | null;
  showChecklist: boolean;
  checklist: { key: ChecklistKey; done: boolean }[];
  activeDays: number;
  activated: boolean;
}

// Cross-device onboarding + first-week activation state (see backend src/onboarding). Long stale
// time -- the checklist items change at most a few times in a student's first week.
export function useOnboarding(enabled = true) {
  return useRawQuery<OnboardingState>(['/onboarding'], '/onboarding', {
    enabled,
    staleTime: 5 * 60_000,
  });
}
