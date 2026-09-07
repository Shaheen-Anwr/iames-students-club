# UX audit

Phase 0 output. Screen inventory + a heuristic pass + a severity-ranked issue log. Fill the
"Heuristic pass" column as each surface is reviewed on a **real phone** (not desktop devtools —
that's how the reels squish shipped unnoticed).

> **Aha moment (fill after `docs/retention-baseline.md` §3 is done):** _TBD_
> Every onboarding + empty-state decision below should push the user toward it.

---

## 0. Cross-cutting findings (apply everywhere)

| # | Sev | Finding | Notes |
|---|---|---|---|
| X1 | **High** (in progress) | **~80 routes / ~20 top-level sections.** No clear hierarchy; the "المزيد" menu was a dumping ground. | **Stage 1:** 5-hub IA + grouped "كل الأقسام" sheet (`f008d70`). **Stage 2:** `CommunityTabs` strip on /feed(mobile)/wall/events/marketplace; `StudyTabs` trimmed 12→6 + "المزيد" overflow, `/quizzes` folded into the study hub. **Next (Stage 3):** merge `/friends` into `/profile`; consider a `/study/quizzes` redirect; per-hub polish. |
| X2 | ~~High~~ ✅ | **Activation blocked on manual admin approval** of college email. Turned out `collegeEmailVerifiedAt` gated *nothing* and the email is already domain-enforced at signup. | **Fixed (Phase 1):** signup auto-verifies (`UsersService.create`), existing base backfilled (`main.ts`), `VerifyEmailBanner` deleted. |
| X3 | **Med** | **RTL bidi**: Latin/digit runs (emails, codes, times) reverse inside Arabic unless wrapped in `dir=ltr`/`<bdi>`. Recurring bug class. | Audit every place Latin meets Arabic. Lint rule if possible. |
| X4 | **Med** | **"tsc clean, not run in-app"** is the default ship state across the codebase. Regressions like the reels squish reach prod. | Track A3: a real preview/QA gate; screenshot tests on key screens. |
| X5 | **Med** | Design system stuck mid-migration (`frontend_design_system_upgrade` Phase C). Mixed tokens vs one-off styles. | Track A1: finish tokens, enforce, delete one-offs. |
| X6 | **Low** | Free-tier infra ceiling (Cloudinary 25GB/mo, Render, Atlas). Perf/scale cap. | Plan the paid upgrade before it bites. |
| X7 | **Low** (in progress) | Lists rendered the **empty** state on a fetch **error** — a network failure looked like "nothing here". | New `components/ui/LoadError.tsx` primitive; wired into feed / wall / events / marketplace / Q&A / rooms. **Remaining:** home mini-cards, admin panels, leaderboard/planner/attendance — adopt `LoadError` in their polish pass. |

---

## 1. Screen inventory & heuristic pass

Heuristic pass = quick yes/no per screen on: **loading state? empty state? error state? RTL
correct? touch targets ≥44px? no layout shift? motion on transitions? copy clear? a11y (focus,
labels, contrast)?** Score `ok` / `minor` / `broken`, link issues below.

### Primary (daily use — audit first)

| Route | Purpose | Heuristic pass | Issues |
|---|---|---|---|
| `/home` | Personalised dashboard (customisable widgets) | TBD | |
| `/feed` | شعبة social feed | TBD | |
| `/reels` | اكاديميا vertical video | ✅ redesigned (`afd0036`) — verify on device | |
| `/chat`, `/chat/[id]` | DMs + group chat + calls | TBD | |
| `/study/schedule` | Weekly timetable (aha candidate) | polish pass done | +"الآن / التالية" banner, live now-line on the grid, error state (`LoadError`), mobile list = today-first + "اليوم" chip. Remaining: skeleton (vs spinner), board-photo lightbox polish. |
| `/notifications` | Activity feed | TBD | |
| `/profile`, `/profile/[id]` | Own + others' profile | TBD | |

### Study hub

| Route | Purpose | Heuristic pass | Issues |
|---|---|---|---|
| `/study/courses`, `/study/courses/[code]` | Course hubs (tabbed) | TBD | |
| `/study/assignments` | Assignments board | TBD | |
| `/quizzes`, `/quizzes/[id]` | Quizzes | TBD | |
| `/study/qa`, `/study/qa/[id]` | Q&A | TBD | |
| `/lectures/pdf`, `/lectures/video` (+ `/[folder]`) | Lecture library | TBD | folder grid just walled by شعبة (`d55a7e3`) |
| `/study/calendar` | Month calendar | TBD | |
| `/study/dashboard` | GPA + attendance + assignments | TBD | |
| `/study/planner` | Personal task planner | TBD | |
| `/study/gpa`, `/study/attendance` | Trackers | TBD | |
| `/study/leaderboard` | Gamification board | TBD | |
| `/study/military` | التربية العسكرية section | TBD | |
| `/study/saved` | Saved posts | TBD | |

### Community

| Route | Purpose | Heuristic pass | Issues |
|---|---|---|---|
| `/groups`, `/groups/discover`, `/groups/[id]/...` | Study groups + channels + group study | TBD | explorer walled by شعبة (`14805aa`) |
| `/wall` | Anonymous campus wall | TBD | |
| `/events` | Campus events + RSVP | TBD | |
| `/marketplace` | Student marketplace | TBD | |
| `/rooms`, `/rooms/[id]` | Study-together Pomodoro rooms | TBD | |
| `/friends` | Friends + requests | TBD | |
| `/search` | Global search | TBD | |
| `/announcements` | Announcements | TBD | |

### Tools & AI

| Route | Purpose | Heuristic pass | Issues |
|---|---|---|---|
| `/ai`, `/ai/[id]` | Assistant «رافد» full page | TBD | also a floating FAB app-wide (hidden on `/reels`) |
| `/convert`, `/convert/tools/*` | File converter + PDF tools suite | TBD | large sub-surface; known engine TODOs |

### Auth & onboarding

| Flow | Heuristic pass | Issues |
|---|---|---|
| `/(auth)` login / register | TBD | |
| `OnboardingFlow` (4 steps, localStorage-gated) | TBD | instrumented — check completion vs skip rate |

### Admin (`/admin/*`, ~13 routes) — lower priority, staff-only

| Group | Heuristic pass | Issues |
|---|---|---|
| users / stats / community / content / learning panels | TBD | `/admin/users/*` gated to `isSuperAdmin` |

---

## 2. Issue log

Add findings here as `A#`, newest first. Severity: **High** (blocks a core task / hurts
retention) · **Med** (friction, workaround exists) · **Low** (polish).

| # | Sev | Screen | Finding | Repro | Fix idea | Status |
|---|---|---|---|---|---|---|
| A1 | High | `/reels` | Feed squished to ~40% viewport, controls overlapping, AI FAB over video | iPhone SE, before `afd0036` | Immersive `fixed inset-0` takeover | ✅ fixed `afd0036` |
| A2 | High | `/lectures/pdf`,`/lectures/video` | Other departments' folders visible | هندسة account, prod | Wall `listLectureFolders` by شعبة | ✅ fixed `d55a7e3` (needs deploy) |
| A3 | High | `/feed` toolbar | Course chips showed every department's courses | هندسة account | Wall `GET /posts/courses` | ✅ fixed `14805aa` (needs deploy) |
| _add rows as the heuristic pass runs_ | | | | | | |

---

## 3. Next (Phase 1 input)

Once §1 is filled, the Phase 1 backlog falls out of it:
1. Everything **High** in §0 + §2.
2. Design-system finish (X5) — unblocks consistent polish.
3. Per-surface polish sweep, **Primary** section first, one per cycle, each with a before/after
   on the relevant `docs/analytics-events.md` metric.
