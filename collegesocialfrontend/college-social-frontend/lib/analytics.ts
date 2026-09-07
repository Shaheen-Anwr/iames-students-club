'use client';

// Central product-analytics event dictionary (Phase 0 of the UI/UX + retention roadmap).
//
// One stable name per user action we need for the activation funnel, the retention curve, and
// the "aha moment" hypothesis. Sits on top of lib/observability.ts's captureEvent() so it stays
// a no-op until NEXT_PUBLIC_POSTHOG_KEY is set.
//
// Rules:
//  - snake_case, stable forever. Renaming an event silently breaks every saved funnel/insight.
//  - properties are flat primitives only (PostHog groups/filters on those).
//  - NEVER put message text, emails, names, tokens, or file contents in properties.
//
// See docs/analytics-events.md for when each fires and its properties.

import { captureEvent } from './observability';

export const AnalyticsEvent = {
  // --- Activation funnel (D0) ---------------------------------------------------------------
  SignedUp: 'signed_up', // { role, has_referral }
  LoggedIn: 'logged_in', // { role, department }
  LoggedOut: 'logged_out',
  OnboardingStepViewed: 'onboarding_step_viewed', // { step, step_name }
  OnboardingCompleted: 'onboarding_completed', // { steps_total }
  OnboardingSkipped: 'onboarding_skipped', // { step }
  // NOTE: `activation_pending_shown` was retired when signup switched to auto-verify (Phase 1) --
  // the "pending admin review" banner no longer exists.
  DepartmentPromptShown: 'department_prompt_shown', // "pick your شعبة" banner rendered
  PushPermissionResult: 'push_permission_result', // { result: 'granted'|'denied'|'default' }

  // --- Core engagement — habit signals & aha-moment candidates -----------------------------
  ScheduleViewed: 'schedule_viewed', // { source } — leading aha hypothesis for a student app
  FeedViewed: 'feed_viewed', // { scope }
  PostCreated: 'post_created', // { scope, has_attachment }
  PostReacted: 'post_reacted', // { type }
  CommentAdded: 'comment_added', // { surface: 'post'|'reel' }
  ReelViewed: 'reel_viewed', // fired once per reel after the 2s view threshold
  ReelCreated: 'reel_created',
  MessageSent: 'message_sent', // { conversation_type: 'dm'|'group'|'channel' } — NO text
  QuestionAsked: 'question_asked', // { scope }
  AssignmentCompleted: 'assignment_completed',
  QuizSubmitted: 'quiz_submitted', // { score_pct }
  LectureOpened: 'lecture_opened', // { kind: 'pdf'|'video' }

  // --- Re-engagement ----------------------------------------------------------------------
  NotificationOpened: 'notification_opened', // { type }
  DigestOpened: 'digest_opened', // any deep link arriving with ?src=digest
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

/** Fire a product-analytics event. No-op until PostHog has a key. */
export function track(event: AnalyticsEventName, props?: Record<string, string | number | boolean | null | undefined>) {
  captureEvent(event, props);
}
