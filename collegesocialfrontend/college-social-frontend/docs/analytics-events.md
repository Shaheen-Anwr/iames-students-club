# Analytics events

The event dictionary for the UI/UX + retention roadmap. Names live in `lib/analytics.ts`
(`AnalyticsEvent`), fired via `track(name, props)`, which is a no-op until
`NEXT_PUBLIC_POSTHOG_KEY` is set (see `lib/observability.ts`, `.env.production`).

## Rules

- **Names are permanent.** Renaming an event silently breaks every saved PostHog funnel/insight.
- Properties: flat primitives only (`string | number | boolean | null`).
- **Never** put message text, emails, names, tokens, IDs of other users, or file contents in a
  property. `identify()` person-properties are limited to cohort dimensions (role, department,
  academic year, verified) — no PII.
- Prefer one event per *action*, not per *render*. The two `*_shown` banner events are the
  deliberate exception (they measure a funnel blocker).

## Automatic (no `track()` call)

| Event | Source | Notes |
|---|---|---|
| `$pageview` | `components/Observability.tsx` | fired on every App Router navigation |
| `$autocapture` | PostHog | clicks / form submits, on by default |
| `web_vitals` | `useReportWebVitals` | LCP / INP / CLS / FCP / TTFB, `{ metric, value, rating, path }` |
| `timing` | `measureSince()` | `app:ready` on boot; add more marks per surface |
| session replay | PostHog | inputs masked, `[data-ph-mask]` blocked, gated by the PostHog project setting |

## Instrumented (Phase 0)

### Activation funnel (D0)

| Event | Fires when | Properties |
|---|---|---|
| `signed_up` | `/auth/register` succeeds + `/users/me` loaded | `role`, `has_referral` |
| `logged_in` | `/auth/login` succeeds + `/users/me` loaded | `role`, `department` |
| `logged_out` | user logs out | — |
| `onboarding_step_viewed` | each onboarding step becomes visible | `step`, `step_name` (`welcome`/`department_year`/`push`/`tour`) |
| `onboarding_completed` | onboarding finished via "ابدأ الآن" | `step`, `steps_total` |
| `onboarding_skipped` | onboarding dismissed via "تخطٍّ" | `step`, `steps_total` |
| `department_prompt_shown` | the "pick your شعبة" banner renders | — |
| `push_permission_result` | `Notification.requestPermission()` resolves | `result` (`granted`/`denied`/`default`) |

### Core engagement

| Event | Fires when | Properties |
|---|---|---|
| `schedule_viewed` | `ScheduleGrid` mounts | `role` — **leading aha-moment hypothesis** |
| `feed_viewed` | `FeedList` mounts / scope tab changes | `scope` |
| `post_created` | `POST /posts` succeeds in `CreatePostBox` | `scope`, `has_attachment`, `has_course` |
| `post_reacted` | a reaction is added/changed in `PostCard` (un-react is skipped) | `type` |
| `comment_added` | a comment posts in `CommentsModal` / `ReelCommentsSheet` | `surface` (`post`/`reel`) |
| `reel_viewed` | a reel passes the 2s view threshold | — |
| `reel_created` | a reel upload completes | — |
| `message_sent` | a chat/channel message is emitted (`ChatWindow`/`ChannelWindow`) — **never the text** | `conversation_type` (`dm`/`group`/`group_public`/`channel`), `has_attachment` |
| `question_asked` | `AskQuestionModal` submit succeeds | `scope` (`public`/`department`/`group`), `has_course` |
| `assignment_completed` | `AssignmentCard` marked done (un-mark skipped) | — |
| `quiz_submitted` | quiz attempt posts in `QuizDetailView` | `score_pct` |
| `lecture_opened` | "فتح في وضع القراءة" tapped on a `LectureCard` | `kind` (`pdf`) |

### Re-engagement

| Event | Fires when | Properties |
|---|---|---|
| `notification_opened` | a notification row is tapped in `NotificationBell` | `type`, `was_unread` |
| `digest_opened` | the app loads with `?src=digest` in the URL (`Observability`) | — |

Backend: the morning digest + weekly recap push URLs now carry `?src=digest`
(`digest.service.ts`). Add the same `?src=` tag to other push types (`release`, `announcement`)
when you want their click-through measured too.

## Not yet instrumented — candidates for later

- `lecture_opened` for **video** lectures (no clean single "open" action in `LectureCard` — the
  player is inline in `AttachmentPreview`). Add if video engagement becomes a question.
- RSVP'd an event, listed on marketplace, joined a room, joined a group, ran a converter job —
  add per-feature as those surfaces get their polish pass.
