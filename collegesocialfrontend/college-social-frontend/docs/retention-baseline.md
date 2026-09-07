# Retention baseline

Phase 0 output. This file is a **template** — the numbers stay `TBD` until PostHog has been
collecting for ~2 weeks (one full cohort past D7, ideally past D14).

## How to fill it

1. Set `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_SENTRY_DSN` in `.env.production`, redeploy.
2. In PostHog, turn on **Session Replay** for the project (masking is already configured in code).
3. Wait for real traffic. Then build the insights below and paste the numbers + the insight URL.
4. Re-run this monthly; keep the history so trends are visible.

---

## 1. Retention curve

PostHog → Retention. First event `signed_up`, returning event `$pageview` (any).

| Cohort | D1 | D7 | D14 | D30 |
|---|---|---|---|---|
| All users | TBD | TBD | TBD | TBD |
| By department: business_administration | TBD | TBD | TBD | TBD |
| By department: media_science | TBD | TBD | TBD | TBD |
| By department: engineering | TBD | TBD | TBD | TBD |
| By academic_year: year1 | TBD | TBD | TBD | TBD |
| verified = true | TBD | TBD | TBD | TBD |
| verified = false | TBD | TBD | TBD | TBD |

> Hypothesis to confirm: the D1 cliff is the dominant loss, and `verified = false`
> (stuck in admin approval) retains far worse. If true, the activation fix in Track B is the
> single highest-leverage change.

## 2. Activation funnel

PostHog → Funnel, ordered:
`signed_up` → `onboarding_completed` → `department_prompt_shown` **is NOT hit** (i.e. dept set)
→ `schedule_viewed` (first session) → `push_permission_result` = granted → returns D1.

| Step | Conversion | Drop |
|---|---|---|
| signed_up → onboarding_completed | TBD | TBD |
| onboarding_completed → dept set | TBD | TBD |
| dept set → schedule_viewed (session 1) | TBD | TBD |
| → push granted | TBD | TBD |
| → returned D1 | TBD | TBD |

Also pull as raw rates:

- `activation_pending_shown` unique users ÷ `signed_up` = **% stuck in admin approval** → TBD
- `push_permission_result` = `granted` ÷ all results = **push opt-in rate** → TBD
- `onboarding_skipped` ÷ (`onboarding_completed` + `onboarding_skipped`) = **skip rate** → TBD
- median step reached on `onboarding_step_viewed` before skip → TBD

## 3. "Aha moment" — hypothesis & test

**Hypothesis:** a student who **views their real schedule in their first session** retains
markedly better at D7 than one who doesn't. (Runner-up candidates: sent a chat message; opened a
lecture.)

**Test (PostHog → Retention, filtered):**
- Cohort A: `signed_up` users who also fired `schedule_viewed` within 24h of signup
- Cohort B: `signed_up` users who did not
- Compare D7. A lift of ≥15 pts (absolute) confirms it.

Repeat the same A/B split for `message_sent` and `lecture_opened` once those are instrumented,
and pick whichever has the strongest, earliest correlation.

| Candidate | D7 (did it, session 1) | D7 (didn't) | Lift | Verdict |
|---|---|---|---|---|
| schedule_viewed | TBD | TBD | TBD | TBD |
| message_sent | TBD | TBD | TBD | TBD |
| lecture_opened | TBD | TBD | TBD | TBD |

Whichever wins becomes the **north-star for onboarding**: get every new user to it in <60s.

## 4. Engagement mix (DAU/WAU/MAU)

| Metric | Value |
|---|---|
| DAU | TBD |
| WAU | TBD |
| MAU | TBD |
| DAU/MAU (stickiness) | TBD |
| Top 5 pages by `$pageview` | TBD |
| Top 5 events by volume | TBD |
| % sessions that fire zero core-engagement events (bounces) | TBD |

## 5. Notifications

| Metric | Value |
|---|---|
| Push opt-in rate | TBD |
| `notification_opened` per active user per day | TBD |
| Top notification `type` by open rate | TBD |
| Bottom notification `type` by open rate (candidates to cut / batch into digest) | TBD |
| `digest_opened` ÷ digests sent (needs backend `?src=digest` + instrumentation) | TBD |

---

## Phase 0 checklist

- [ ] `NEXT_PUBLIC_POSTHOG_KEY` set in `.env.production`, deployed
- [ ] `NEXT_PUBLIC_SENTRY_DSN` set, deployed, test error visible in Sentry
- [ ] Session Replay enabled in PostHog project settings; spot-check a replay for leaked PII
- [ ] Events from `docs/analytics-events.md` "Instrumented" table all showing in PostHog Live
- [ ] `docs/ux-audit.md` filled (screen inventory + heuristic pass + severity-ranked issues)
- [ ] This file's tables filled from ≥2 weeks of data
- [ ] Aha moment picked and written at the top of `docs/ux-audit.md`
- [ ] Phase 1 scoped from the findings
