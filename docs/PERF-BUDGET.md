# Performance budget

Concrete, tracked numbers for how the app should *feel*. A change that regresses one of these
without a deliberate trade-off is a bug. Measured at the 75th percentile (p75) of real sessions
unless noted — a good p50 with a bad p75 still means a quarter of students have a slow app.

Stack context: Next 14 (Vercel) → `/api/*` rewrite → NestJS (Render, single instance, cold-starts)
→ MongoDB Atlas; media on Cloudinary; realtime on Socket.IO.

## Targets

| Metric | Budget (p75) | Why this number |
| --- | --- | --- |
| **Cold start → app shell visible** | < 400ms | Cached user snapshot in `auth-context` paints the shell before `/users/me` returns. Only a first-ever sign-in on a device may exceed this. |
| **Cold start → first content (home)** | < 1.2s on 4G | Persisted query cache paints last-known data immediately; the network refresh reconciles behind it. |
| **Client route change → first meaningful paint** | < 200ms from cache / < 800ms cold | Route re-entry within `staleTime` (30s) must be instant. A never-visited route may fetch. |
| **INP (Interaction to Next Paint)** | < 200ms | The Core Web Vital that captures "does tapping feel responsive". Any handler over 200ms of main-thread work is over budget. |
| **LCP** | < 2.5s on 4G | Standard "good" threshold. |
| **CLS (after first frame)** | < 0.02 | Route `loading.tsx` skeletons must match the loaded layout. Nothing jumps once painted. |
| **Chat send → message on screen** | < 50ms | Optimistic send (already built) — never wait on the socket ack to render. |
| **Pull-to-refresh / swipe-action → haptic + visual response** | < 16ms (1 frame) | Gesture feedback is synchronous; the network call happens after. |
| **API response (cached read, warm backend)** | < 150ms | Redis read-cache on the hot aggregates (dashboard, leaderboard, online-now, course hub). |
| **API response (uncached read, warm backend)** | < 500ms p95 | Needs the Mongo compound-index audit + `.lean()` + projections on the شعبة-scoped-and-sorted paths. |
| **Backend cold start (Render)** | < 8s, and invisible to the user | The keep-warm Action pings `/api` every 10 min (05–23 UTC). The cached shell + persisted queries mean a cold backend degrades gracefully rather than blocking. |
| **JS shipped per route (gzipped)** | < 250KB | `next build` route summary. Watch `framer-motion`, `recharts`, `hls.js` — load the heavy ones per-route, not app-wide. |
| **Web Push → notification shown** | < 5s from server send | Once BullMQ replaces the in-process/`@Cron` fan-out. |

## How to measure

- **RUM (real users):** Web Vitals (INP, LCP, CLS, TTFB) via `lib/observability.ts` → PostHog, once
  `NEXT_PUBLIC_POSTHOG_KEY` is set. Add custom marks: `perf.mark('feed:first-content')`,
  `perf.mark('chat:interactive')`, and ship the deltas as events.
- **Synthetic:** `next build` for bundle sizes; Lighthouse (mobile, 4G throttle) on `/home`, `/feed`,
  `/chat`, a course hub, and `/reels` before each release.
- **Backend:** log route timing p50/p95 per endpoint; alert on p95 regressions on the feed/wall/
  dashboard paths.
- **Weekly:** one dashboard — INP/LCP/CLS p75 trend, slowest 5 routes, slowest 5 API endpoints,
  bundle size deltas. Any red cell gets an owner or an accepted-exception note.

## Non-negotiables (not numbers, but rules)

1. No full-screen spinner for a returning user. Ever. The shell paints from cache.
2. No route without a layout-matched `loading.tsx`.
3. No blocking `await` in a tap handler before the first visual response.
4. Every list that can grow is virtualised or paginated with a cursor — never render 500 rows.
5. Media is delivered through the CDN/proxy with a width-appropriate `srcset`, never the raw
   Cloudinary origin at full size.
6. Reduced-motion and low-end devices get the same *function*, just without the transforms.
