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
| `activation_pending_shown` | the "college email pending admin review" banner renders | — |
| `department_prompt_shown` | the "pick your شعبة" banner renders | — |
| `push_permission_result` | `Notification.requestPermission()` resolves | `result` (`granted`/`denied`/`default`) |

### Core engagement

| Event | Fires when | Properties |
|---|---|---|
| `schedule_viewed` | `ScheduleGrid` mounts | `role` — **leading aha-moment hypothesis** |
| `feed_viewed` | `FeedList` mounts / scope tab changes | `scope` |
| `post_created` | `POST /posts` succeeds in `CreatePostBox` | `scope`, `has_attachment`, `has_course` |
| `reel_viewed` | a reel passes the 2s view threshold | — |
| `reel_created` | a reel upload completes | — |

### Re-engagement

| Event | Fires when | Properties |
|---|---|---|
| `notification_opened` | a notification row is tapped in `NotificationBell` | `type`, `was_unread` |

## Not yet instrumented — next pass

Add `track()` at these call sites (constants already exist in `lib/analytics.ts`):

- `post_reacted` — `PostCard` reaction handler (`{ type }`)
- `comment_added` — post + reel comment submit (`{ surface }`)
- `message_sent` — chat send (DM / group / channel) — **properties only, never the text**
- `question_asked` — `AskQuestionModal` submit (`{ scope }`)
- `assignment_completed` — assignment toggle-complete
- `quiz_submitted` — quiz attempt submit (`{ score_pct }`)
- `lecture_opened` — opening a PDF/video lecture (`{ kind }`)
- `digest_opened` — any deep link arriving with `?src=digest` (also add `src=digest` to the
  morning-digest push URLs on the backend)
