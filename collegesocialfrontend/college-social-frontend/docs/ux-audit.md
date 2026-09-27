# UX audit

Phase 0 output. Screen inventory + a heuristic pass + a severity-ranked issue log. Fill the
"Device pass" column as each surface is reviewed on a **real phone** (not desktop devtools —
that's how the reels squish shipped unnoticed).

> **Aha moment (fill after `docs/retention-baseline.md` §3 is done):** _TBD_
> Every onboarding + empty-state decision below should push the user toward it.

**2026-09-27 pass:** full inventory of all 81 `page.tsx` routes, ranked journeys, and a static
code pass of every route's component tree. New issues A4–A18 are listed in priority order in §3.
The order to work through them is in §4.

### How this pass ranks things

- **No usage data yet.** The PostHog baseline (`retention-baseline.md`) is still TBD, so journeys
  are ranked by proxy signals: (1) placement in the primary nav, (2) push deep-link targets
  (`push-payload.util.ts`, digest, class reminder), (3) where login, register and app-open land,
  (4) the events chosen as "core engagement" in `analytics-events.md`, (5) external share links.
  **Re-check §1 against the top 5 `$pageview` paths** once there are two weeks of data.
- **Code pass ≠ device pass.** The code pass is a static read of loading, empty and error handling,
  RTL isolation and token use. It finds dead ends and misleading states. It cannot find layout,
  motion or touch-feel bugs. The device pass stays TBD.
- **Impact = Reach × Severity.** Reach: 3 = core journey, push target or every route · 2 = weekly
  or secondary · 1 = long tail or staff-only. Severity: 3 = dead end (no way forward) · 2 =
  misleading or friction · 1 = polish. Ties are broken by effort (S = under half a day, M = 1–3 days).

---

## 0. Cross-cutting findings (apply everywhere)

| # | Sev | Finding | Notes |
|---|---|---|---|
| X7 | ~~Low~~ → **High** | **Failure paths are the biggest problem class.** The earlier `LoadError` work covered the list screens. The screens users reach from a push are mostly not covered. | Re-ranked on evidence from the 2026-09-27 pass: 7 screens can spin forever (A6), `/home` can stay on its skeleton forever (A4), about 12 screens show "nothing here" when a request fails (A9), and no route has an error boundary (A7). Fix pattern: `isError && !data → <LoadError onRetry>`. Wrap one-off fetches in `useApiQuery` so they get `isError` for free. |
| X8 | **High** (new) | **Deep links are unreliable.** A signed-out open drops the destination (A5). Server-side push links have drifted from the in-app links (A8). Wall and event pushes land on a list, not the item (A12). | Push and share links are the main way users come back, and the first thing an invited user touches. |
| X1 | ~~High~~ → **Med** (in progress) | **~80 routes / ~20 top-level sections.** No clear hierarchy; the "المزيد" menu was a dumping ground. | **Stage 1:** 5-hub IA + grouped "كل الأقسام" sheet (`f008d70`). **Stage 2:** `CommunityTabs` strip on /feed(mobile)/wall/events/marketplace; `StudyTabs` trimmed 12→6 + "المزيد" overflow, `/quizzes` folded into the study hub. Downgraded because stages 1–2 fixed the worst of it. **What's left is specific:** the lecture library is missing from the study tabs (A11); login, register and app-open land on different screens (A10); some routes are redundant (A15). Stage 3 (merge `/friends` into `/profile`) still stands. |
| X2 | ~~High~~ ✅ | **Activation blocked on manual admin approval** of college email. Turned out `collegeEmailVerifiedAt` gated *nothing* and the email is already domain-enforced at signup. | **Fixed (Phase 1):** signup auto-verifies (`UsersService.create`), existing base backfilled (`main.ts`), `VerifyEmailBanner` deleted. |
| X3 | **Med** | **RTL bidi**: Latin/digit runs (emails, codes, times) reverse inside Arabic unless wrapped in `dir=ltr`/`<bdi>`. Recurring bug class. | **Narrowed by the 2026-09-27 pass.** Confirmed open bugs are the email fields in password recovery and personal-email settings (A13). Chat and converter file names are a likely second source. Checked and *not* bugs: bare college IDs, course codes like `CS101`, and `HH:MM - HH:MM` ranges. Each renders as a single run and reads correctly right-to-left. Systemic fix: default `dir="ltr"` in `components/ui/Input.tsx` for `type` email/url/tel/password. |
| X4 | **Med** | **"tsc clean, not run in-app"** is the default ship state across the codebase. Regressions like the reels squish reach prod. | Track A3: a real preview/QA gate; screenshot tests on key screens. `e2e/smoke.spec.ts` only covers login, register, offline and the unauthenticated redirect. **No signed-in screen is tested.** Start with one signed-in smoke test per J1–J4 journey (§1). |
| X5 | ~~Med~~ → **Low** | Design system stuck mid-migration (`frontend_design_system_upgrade` Phase C). Mixed tokens vs one-off styles. | **Re-ranked on evidence:** off-token colours appear in only **24 of 375** `.tsx` files (172 raw palette classes). **112 of those** are one categorical avatar palette, copy-pasted into `CourseHub`, `CourseHubDetail`, `WallFeed` and `LectureFoldersGrid`. Every copy already has `dark:` variants, so there is no theme bug. The real drift is small: attendance and GPA status colours use raw `emerald/red/amber/slate` instead of the `success/danger/warning` tokens (A14). |
| X6 | **Low** | Free-tier infra ceiling (Cloudinary 25GB/mo, Render, Atlas). Perf/scale cap. | Plan the paid upgrade before it bites. Render cold starts make failed requests more likely, which raises the cost of X7. |

---

## 1. Highest-use journeys (ranked)

| # | Journey | Route chain | Why it ranks here | Health | Blocking issues |
|---|---|---|---|---|---|
| J1 | **Daily open** | `/` → `/home` (also daily digest push `/home?src=digest`) → next-class / due cards → `/study/schedule`, `/study/assignments` | App-open landing + daily push target + primary tab | ❌ for new users and users away >24h | A4, A7 |
| J2 | **Messaging** | `chat_message` push → `/chat/[id]`; group: `channel_message` push → `/groups/[g]/[c]` | Primary tab + highest-frequency push types + `message_sent` is an aha candidate | DMs ✅ · group channels ❌ when a load fails | A6 |
| J3 | **Class reminder → schedule** | push `?src=classreminder` → `/study/schedule` | Leading aha hypothesis (`schedule_viewed`) + a push 15 min before every lecture | ✅ | none |
| J4 | **Social loop** | `/feed` → react/comment → push to author → should land on `/posts/[id]?comments=1` | Primary tab + login/register landing + the post/comment push types | ⚠️ push lands on `/feed`, not the post | A8 |
| J5 | **Lecture materials** | `/study` → `/study/courses` → `/study/courses/[code]` (محاضرات tab) · or "الكل" → `/lectures/pdf` → `/[folder]` → reader / AI study kit | `lecture_opened` aha candidate, core academic value | ⚠️ | A9, A11 |
| J6 | **Coursework** | `/study/assignments` · `/quizzes` → `/quizzes/[id]` | Primary study tabs; `assignment_completed`, `quiz_submitted` | ❌ quiz detail on failure · ⚠️ lists | A6, A9 |
| J7 | **Q&A** | `/study/qa` → ask → `qa_answer` push → `/study/qa/[id]` | Push target; `question_asked` | ❌ detail on failure | A6 |
| J8 | **Activation from a link** | shared post/profile/reel or group invite `/groups/join?code=` → `/login` or `/register` → onboarding → first session | Every new user; the growth loop from the share feature | ❌ destination and invite code are lost; first session never reaches the aha screen | A5, A10 |
| J9 | **Reels** | "الكل" → `/reels` · `reel_*` push → `/reels/[id]` | Push target, `reel_viewed` | ✅ (redesigned `afd0036`, verify on device) | none |
| J10 | **People** | `friend_*` push / search / mention → `/profile/[id]` → مراسلة | Push target | ⚠️ | A9 |

---

## 2. Route inventory & code pass

**81 `page.tsx` = 63 user-facing screens** (13 of them the file converter) **+ 14 admin + 3
redirect-only** (`/`, `/study`, `/groups/[groupId]`) **+ 1 dev gallery.** 40 `loading.tsx` files
cover every signed-in segment. There is **no `error.tsx` and no `not-found.tsx` anywhere** (A7).

Code pass: ✅ loading, empty and error states are all distinct · ⚠️ a failed request shows as empty
or fails silently · ❌ dead end (infinite spinner, stuck skeleton, lost destination).

### Tier 1: core daily (primary tabs + push targets)

| Route | Reached from | Code pass | Device pass | Issues |
|---|---|---|---|---|
| `/home` | app-open `/`, bottom bar, digest push | ❌ `GET /dashboard` fails → `HomeSkeleton` forever | TBD | A4 |
| `/feed` | bottom bar, login + register landing, post pushes (server-side) | ✅ | TBD | A8, A10 |
| `/chat` | bottom bar | ✅ | TBD | |
| `/chat/[conversationId]` | `chat_message` push, profile "مراسلة" | ✅ | TBD | |
| `/study` | bottom bar | redirect → `/study/courses` | — | A10 |
| `/study/schedule` | class-reminder push, StudyTabs, home cards | ✅ | polish pass done | +"الآن / التالية" banner, live now-line, `LoadError`, mobile today-first list. Remaining: skeleton (vs spinner), board-photo lightbox polish. |
| `/study/courses` | `/study` redirect | ✅ | TBD | |
| `/study/courses/[code]` | course cards, schedule | ⚠️ failure shows "0 محاضرة · 0 واجب" | TBD | A9 |
| `/study/assignments` | StudyTabs, home cards | ⚠️ | TBD | A9 |
| `/notifications` | bell, home cards | ✅ | TBD | |
| `/profile` | bottom bar | ✅ | TBD | A13 |
| `/profile/[id]` | friend push, search, mentions, share links | ⚠️ network error shows "لم يتم العثور على المستخدم"; مراسلة has no catch | TBD | A9 |
| `/posts/[id]` | in-app notification rows, share links | ✅ (tells a 404 apart from a network error) | TBD | A8 |
| `/groups/[groupId]/[channelId]` | `channel_message` push, group sidebar | ❌ | TBD | A6 |
| `/groups/[groupId]` | group cards (redirects to first channel) | ❌ no catch; a group with 0 channels spins forever | — | A6 |
| `/reels`, `/reels/[id]` | "الكل", reel pushes, share links | ✅ | ✅ redesigned (`afd0036`), verify on device | |

### Tier 2: weekly / secondary

| Route | Reached from | Code pass | Device pass | Issues |
|---|---|---|---|---|
| `/quizzes` | StudyTabs, "الكل" | ⚠️ no catch | TBD | A9 |
| `/quizzes/[id]` | quiz cards, course hub | ❌ | TBD | A6 |
| `/study/qa` | StudyTabs, top bar | ✅ | TBD | |
| `/study/qa/[id]` | `qa_answer` push | ❌ | TBD | A6 |
| `/lectures/pdf`, `/lectures/video` | "الكل" sheet, ⌘K, home "since last seen" | ⚠️ no catch, so a failure shows an empty grid | TBD | A9, A11. Folder grid walled by شعبة (`d55a7e3`) |
| `/lectures/*/[folder]` | folder grid | ✅ | TBD | |
| `/study/calendar` | StudyTabs, calendar-event push | ⚠️ | TBD | A9 |
| `/announcements` | announcement push, home strip | ✅ | TBD | |
| `/search` | top bar, ⌘K, hashtags | ⚠️ failure shows "لا توجد نتائج" | TBD | A9, A18 |
| `/groups` | "الكل" → المحادثات | ⚠️ failure shows "no groups" | TBD | A9. Explorer walled by شعبة (`14805aa`) |
| `/groups/[groupId]/study` | group header | ⚠️ (assignments part) | TBD | A9 |
| `/groups/[groupId]/study/qa/[questionId]` | group Q&A list | ❌ | TBD | A6 |
| `/groups/join` | invite links | ❌ when signed out | TBD | A5 |
| `/groups/discover` | home QuickActions only | ✅ | TBD | A15 |
| `/friends` | "الكل", first-week checklist | ✅ (toast) | TBD | A15 |
| `/wall`, `/events`, `/marketplace` | CommunityTabs, "الكل", pushes | ✅ | TBD | A12 |
| `/rooms`, `/rooms/[id]` | "الكل", room push, home "online now" | ✅ | TBD | |
| `/ai` | AI FAB | ✅ | TBD | |
| `/ai/[id]` | conversation list | ❌ a deleted conversation spins forever | TBD | A6 |
| `/chat/starred` | conversation list | ❌ | TBD | A6 |
| `/study/dashboard` | StudyTabs "المزيد" | ⚠️ | TBD | A9 |
| `/study/planner`, `/study/leaderboard` | StudyTabs, home cards | ✅ | TBD | |
| `/study/gpa`, `/study/attendance` | StudyTabs "المزيد", dashboard | ✅ (toast) | TBD | A14 |
| `/study/military` | StudyTabs "المزيد" | ⚠️ failure looks like "no active period" | TBD | A9 |
| `/study/saved` | StudyTabs "المزيد" **and** "الكل" | ⚠️ failure shows "no saved posts" | TBD | A9, A15 |

### Tier 3: tools, auth, staff, dev

| Route | Reached from | Code pass | Device pass | Issues |
|---|---|---|---|---|
| `/convert`, `/convert/tools` + 11 tool routes | "الكل" → أدوات | ✅ (job errors toast) | TBD | A13 (file names), A17. Known engine TODOs |
| `/login`, `/register` | `/` redirect, AppShell redirect | ✅ (bidi fixed earlier) | TBD | A5, A10 |
| `OnboardingFlow` (4 steps, localStorage-gated) | first signed-in render | ✅ | TBD | A10. Instrumented: check completion vs skip rate |
| `/teach` | "الكل" → الطاقم (professor/admin) | ⚠️ `allSettled` failure reads as "لم تنشر … بعد" | TBD | A9 |
| `/admin/*` (14 routes) | "الكل" → الطاقم | ⚠️ `AdminPanel` lists fall back to `[]` | TBD | Staff-only, lowest priority. `/admin/users/*` gated to `isSuperAdmin` |
| `/dev/ui` | nothing links to it | — | — | A16 |

---

## 3. Issue log

Add findings here as `A#`. Severity: **High** (blocks a core task / hurts retention) · **Med**
(friction, workaround exists) · **Low** (polish). The number after the severity is
Reach × Severity (see "How this pass ranks things"). **A4–A18 (2026-09-27) are in priority
order.**

| # | Sev | Screen | Finding | Repro | Fix idea | Status |
|---|---|---|---|---|---|---|
| A4 | **High** · 9 | `/home` | If `GET /dashboard` errors, `data` stays undefined and `if (!user \|\| !data)` renders `HomeSkeleton` forever. There's no retry and pull-to-refresh isn't mounted. The persisted query cache (24h) hides this for daily users, so it hits exactly the **first session** and **users returning after >24h**. | Fresh browser profile, block `/dashboard` in devtools, open `/home` | Add `isError && !data` → `LoadError` with `refetch` (`app/(app)/home/page.tsx:36`). (S) | open |
| A5 | **High** · 9 | every deep link, `/groups/join` | Signed-out opens lose their destination. `AppShell` does `router.replace('/login')` without the path (`AppShell.tsx:19`), then `LoginForm` always goes to `/feed` and `RegisterForm` to `/feed?new=1`. Affects push taps after the session expires, every shared post/profile/reel link, and **group invite links**: a brand-new user loses the invite code and never joins. | Log out → open `/groups/join?code=X` → sign in → you're on `/feed`, not in the group | `/login?next=<path+query>`. Honour it in `LoginForm` and `RegisterForm`, accepting only same-origin relative paths. Keep `?new=1` for first-post nudges when there's no `next`. (S) | open |
| A6 | **High** · 9 | `/groups/[g]/[c]`, `/groups/[g]`, `/study/qa/[id]`, group QA detail, `/quizzes/[id]`, `/ai/[id]`, `/chat/starred` | **Infinite spinners.** The fetch has `.then(() => setLoading(false))` and no catch, so any 403/404/network error spins forever. Two are push targets (`channel_message`, `qa_answer`): a removed group member or a deleted question means tapping the push shows a spinner forever. Sites: `ChannelWindow.tsx:54`, `GroupSidebar.tsx:40`, `groups/[groupId]/page.tsx:14` (also 0 channels), `QuestionDetail.tsx:26`, `QuizDetailView.tsx:35`, `AiChatPanel.tsx:210,225`, `StarredMessages.tsx:17` | Remove yourself from a group, tap an old channel push | Add a catch → error state. Use the 404-vs-error wording from `PostDetail` ("لم يعد متاحًا" vs `LoadError`). (S, one PR) | open |
| A7 | **High** · 9 | all 78 signed-in routes | **No route error boundary and no 404 page.** Any render exception bubbles to `app/global-error.tsx`, which replaces the whole document, so the nav, chat socket and push context are gone. An unknown or stale URL shows Next's default **English, LTR** "404 \| This page could not be found." | Visit `/study/nope` | Add `app/(app)/error.tsx` (renders inside `AppShell`, so the nav survives; `LoadError` look plus `reset`) and an Arabic `app/not-found.tsx` that links to `/home`. (S) | open |
| A8 | **High** · 6 | post/comment/mention pushes | The server-side push links have drifted from the in-app ones. `push-payload.util.ts` `relativeHref()` sends `post_comment`, `post_reaction`, `post_share`, `comment_reply` and `comment_reaction` to **`/feed`**. The in-app `notificationHref()` sends them to `/posts/[id]?comments=1`. `mention` goes to `/feed` on **both** sides, even though mention notifications carry a `postId`. | Comment on someone's post → they tap the push → generic feed | Mirror `NotificationBell.notificationHref()` in `relativeHref()` and add `mention` → `/posts/[id]` on both sides. Longer term, store the href on the notification so there's one source of truth. (S) | open |
| A9 | **Med** · 6 | `/study/assignments`, `/quizzes`, `/lectures/pdf\|video`, `/study/calendar`, `/study/courses/[code]`, `/study/dashboard`, `/study/military`, `/study/saved`, `/groups`, `/search`, `/profile/[id]`, `/teach` | **A failed request shows as empty** (the rest of X7). A catch sets `[]`/`null`, or there's no catch at all, and the screen shows its "nothing yet" copy: "لا توجد نتائج", "لم يتم العثور على المستخدم", "0 محاضرة". Students read it as "my professor hasn't posted". | Offline, open `/study/assignments` | Move each onto `useApiQuery` or `useInfiniteApiList` and add `isError && !data → LoadError`. Order: J5/J6 screens first, then search and profile. `AssignmentsBoard`/`QuizzesBoard` course-code filters also refetch on every keystroke, so use `useDebouncedValue`. (M) | open |
| A10 | **Med** · 6 | `/register`, `/login`, `/study`, onboarding | **The first session never steers to the aha candidate.** Register lands on `/feed?new=1`, login on `/feed`, app-open on `/home`: three different "homes". `/study` redirects to `/study/courses`, not the schedule. `FirstWeekChecklist` has no "see your schedule" or "open a lecture" item. *Depends on §3 of the retention baseline:* if `schedule_viewed` wins, this becomes High. | Register a student account and follow the default path | Land login and register on `/home`, and make the first home card "your schedule today". Add `view_schedule` to the checklist. Consider `/study` → `/study/schedule`. (M) | blocked on aha data |
| A11 | **Med** · 4 | `/lectures/*`, `StudyTabs` | The lecture library (a core academic surface, `lecture_opened` aha candidate) is **not in `StudyTabs`**. It's only reachable through the "الكل" sheet, ⌘K, or course by course via a course hub. | Open الدراسة and look for محاضرات | Add a `المحاضرات` pill to `PRIMARY` (swap out `التقويم`, which moves to "المزيد"), with PDF/video as a toggle inside. (S) | open |
| A12 | **Med** · 4 | push → wall/events | `wall_comment` → `/wall` and `event_reminder` → `/events` land on the list, not the item. There are no permalink routes for wall posts or events. | Get a wall comment push | Add `/wall/[id]` and `/events/[id]` (or `?focus=<id>` with scroll-into-view plus highlight). Store `wallPostId`/`eventId` on the notification. (M) | open |
| A13 | **Med** · 3 | password recovery, `/profile` | RTL bidi: `ForgotPasswordModal` shows the personal email **unisolated inside an Arabic sentence** (`:119`), and its input has no `dir="ltr"` (`:101`). `PersonalEmailForm` has the same problem in its display (`:53`) and input (`:71`). A locked-out user sees their own address scrambled. Chat, channel and converter **file names** have 18 unisolated render sites. Names with leading digits or trailing brackets reorder. | Recovery with `ahmed2002@gmail.com`; attach `2 (final).pdf` | Default `dir="ltr"` in `Input` for email/url/tel/password. Add `<bdi dir="ltr">` around displayed emails and file names. Consider a tiny `<Ltr>` helper plus a lint rule. (S) | open |
| A14 | **Low** · 2 | `/study/attendance`, `/study/gpa` | Token drift (X5): status colours are raw (`bg-emerald-500`, `bg-red-500`, `bg-amber-500`, `bg-slate-400`) instead of the `success`/`danger`/`warning` tokens. The categorical avatar palette is copy-pasted 4×. | — | Map the statuses to semantic tokens. Extract `lib/palette.ts` (`categoricalClass(key)`) and use it in `CourseHub`, `CourseHubDetail`, `WallFeed` and `LectureFoldersGrid`. (S) | open |
| A15 | **Low** · 2 | `/groups/discover`, `/study/saved`, `/friends` | Redundant routes. `/groups/discover` duplicates the public half of `GroupsExplorer` and is linked only from home QuickActions. `/study/saved` appears in both StudyTabs "المزيد" and the "الكل" sheet. `/friends` overlaps the profile (X1 stage 3). | — | Redirect `/groups/discover` → `/groups?filter=public`. Drop saved from one of the two menus. Merge friends into a profile tab. (S) | open |
| A16 | **Low** · 1 | `/dev/ui` | The component gallery ships to production and any signed-in user can reach it by URL. | Visit `/dev/ui` | `notFound()` unless `NODE_ENV !== 'production'`, or restrict it to admins. (S) | open |
| A17 | **Low** · 1 | `/convert/tools/*`, `/ai` | Touch targets: 19 explicit sub-36px tap targets in 15 files, concentrated in converter page grids (`FileOrderGrid`, `PdfPageThumbnailGrid`) and the AI panel. Primary journeys are clean. | iPhone SE, reorder PDF pages | Bump to `h-9 w-9` minimum with a larger hit area (`before:absolute before:-inset-2`). (S) | open |
| A18 | **Low** · 1 | `/search` | Responses aren't cancelled when `q` changes, so a slow earlier response can overwrite a newer one. | Throttled network, type fast | Move to `useApiQuery` keyed on `q` (fixes A9 too). (S) | open |
| A1 | High | `/reels` | Feed squished to ~40% viewport, controls overlapping, AI FAB over video | iPhone SE, before `afd0036` | Immersive `fixed inset-0` takeover | ✅ fixed `afd0036` |
| A2 | High | `/lectures/pdf`,`/lectures/video` | Other departments' folders visible | هندسة account, prod | Wall `listLectureFolders` by شعبة | ✅ fixed `d55a7e3` (needs deploy) |
| A3 | High | `/feed` toolbar | Course chips showed every department's courses | هندسة account | Wall `GET /posts/courses` | ✅ fixed `14805aa` (needs deploy) |
| _add rows as the device pass runs_ | | | | | | |

---

## 4. Priority order (Phase 1 input)

1. **Stop the dead ends.** A4, A5, A6, A7, A8. All are small; ship them as one PR each, in that
   order. Together they cover every ❌ in §2 and fix J1, J2 (groups), J6, J7 and J8.
2. **Honest failure states.** A9, screens ordered J5 → J6 → J10 → the rest. This closes X7.
3. **Activation.** A10 + A11, once `retention-baseline.md` §3 names the aha moment. A11 is worth
   doing regardless.
4. **Deep-link precision.** A12.
5. **Polish batch.** A13–A18. A13 first: it's small, and it hits users who are already stuck at
   password recovery.
6. **Then** the device pass (§2 "Device pass" column, Tier 1 first) and signed-in smoke tests for
   J1–J4 (X4). Each fix should get a before/after on its `docs/analytics-events.md` metric.
