# Docker — step by step (you've never used Docker)

Docker and Compose are **already installed** on this machine (`docker 29.x`, `docker compose v5`)
and you can run them without `sudo`. So skip installation — go straight to Phase 1.

If you ever need to check it's alive:

```bash
docker run --rm hello-world     # prints "Hello from Docker!" and exits
```

---

## 30-second mental model

| Term | What it is |
|---|---|
| **Image** | A frozen, read-only template — an OS + your app + its deps. Built from a `Dockerfile`, or pulled from a registry (`redis:7-alpine`). |
| **Container** | A running instance of an image. Disposable. Delete it, make a new one — nothing is lost *unless* it wrote to a volume. |
| **Volume** | A named disk that outlives containers. Where a database keeps its data. |
| **Compose** | One YAML file (`docker-compose.yml`) describing several containers + volumes so you start them all with one command. |

Phases 1–3 are **local only** — nothing changes production. Phase 4 is the one deploy step: it
switches the existing Render service from the Node buildpack to this Dockerfile (same URL, same
env, one-click rollback).

---

## Phase 1 — run the infra your dev box is missing  ·  ~10 min

Right now, local dev has **no Redis** and points at the **production Atlas** database. That means
you can't test the cache layer, the BullMQ push queue, Redis-backed chat presence, or the
Atlas-Search fallback without deploying. Compose fixes that.

The files are already in the repo:
- `docker-compose.yml` (repo root)
- `collegesocialbackend/college-social-backend/Dockerfile`
- `collegesocialbackend/college-social-backend/.dockerignore`

### 1a — Redis only (do this first — biggest payoff, lowest cost)

From the repo root:

```bash
docker compose up redis
```

**What happens:** Docker pulls `redis:7-alpine` (~15 MB) once, starts it, and streams its logs.
It's listening on `localhost:6379`. Leave this terminal open (or add `-d` to run it in the
background: `docker compose up -d redis`).

Now point the backend at it. In `collegesocialbackend/college-social-backend/.env` add:

```
REDIS_URL=redis://localhost:6379
```

Restart the backend the way you normally do (`npm run start:dev`). In its logs you should now see:

```
Cache backed by Redis
Chat presence backed by Redis
Push delivery queue active (BullMQ).
```

That's it — the whole Pillar B infra is now live locally. Your DB is still Atlas (unchanged).

**Stop it:** `Ctrl+C` in the compose terminal, or `docker compose stop redis`.
**Wipe its data:** `docker compose down -v` (Redis has none worth keeping anyway).

### 1b — add a local MongoDB (optional)

Use this when you want to test destructive DB changes, index behaviour, or work offline —
**without touching Atlas**.

```bash
docker compose up          # starts redis + mongo (both defined without a profile)
```

Then in `.env` swap:

```
MONGODB_URI=mongodb://localhost:27017/college-social
```

The local DB starts **empty**. Register a fresh test account and go. Your Atlas data is not here.
To copy real data down: `mongodump --uri "<atlas uri>"` then `mongorestore --uri "mongodb://localhost:27017"`.

Data survives restarts (it's in the `mongo-data` volume). `docker compose down -v` deletes it.

### 1c — run the backend itself in a container (optional, advanced)

Only worth it if you want to stop installing Node/build tools on the host, or reproduce a
teammate's setup exactly.

```bash
docker compose --profile app up
```

First run takes **2–4 minutes** — it builds the `dev` image and runs `npm ci` inside the
container (so native modules like `bcrypt` are built against the container's libc, not your
host's). After that it's fast; the `backend-deps` volume caches `node_modules`.

Your source is bind-mounted, so `nest start --watch` inside the container still hot-reloads when
you edit files on the host. It reaches Mongo/Redis by their **service names** (`mongodb://mongo:27017`,
`redis://redis:6379`), which Compose wires up automatically — that's why the compose file
overrides `MONGODB_URI`/`REDIS_URL` in its `environment:` block.

> **RAM note for this machine (7.5 GB):** running mongo + redis + the backend container *and*
> VS Code + a browser is tight. The `mem_limit` lines in `docker-compose.yml` cap each container
> so a runaway can't freeze your desktop. In practice: use **1a** day to day, spin up **1b/1c**
> only when you specifically need them.

---

## Phase 2 — build the production image  ·  ~15 min (first build slower)

This is the image you'd deploy. It's `node:22` slim **plus LibreOffice + Poppler + Arabic
fonts**, so the file converter runs at full fidelity — something the Render Node buildpack can't
do today (that's why it falls back to Adobe).

```bash
cd collegesocialbackend/college-social-backend
docker build -t iaems-backend .
```

**What happens:** Docker runs the `Dockerfile` stage by stage — installs build tools, `npm ci`,
`nest build`, then assembles a slim final image with only `dist/`, production `node_modules`, and
the converter's system packages. First build ~4–8 min (downloads base images + apt packages);
later builds reuse cached layers and take seconds unless `package.json` changed.

Run it locally to check it works — point it at your real `.env` (Atlas, Cloudinary, etc.):

```bash
docker run --rm -p 3001:3001 --env-file .env --init iaems-backend
```

In another terminal:

```bash
curl -i http://localhost:3001/api        # expect HTTP 200
docker ps                                # STATUS should say "healthy" after ~1 min
```

`Ctrl+C` to stop (`--rm` deletes the container on exit; the image stays).

**Lean variant** (no converter fidelity, ~250 MB instead of ~1 GB): delete the `libreoffice-* poppler-utils fonts-*`
line from the `runtime` stage of the `Dockerfile`. The converter then uses the Adobe fallback,
exactly like Render does now.

**Common build failures**
| Error | Fix |
|---|---|
| `npm ci` peer-dep error | The `.npmrc` with `legacy-peer-deps=true` must be present — it is, and the Dockerfile `COPY`s it first. |
| `node-gyp` / `bcrypt` build fails | The `builder` stage installs `python3 make g++` — make sure you didn't edit that line out. |
| out of disk | `docker system prune -a` clears old images/layers/build cache. |

---

## Phase 3 — split the web server and the background worker  ·  ~30 min

Goal: one image, two roles. The **web** container serves HTTP. The **worker** container runs the
`@Cron` jobs (digest, weekly recap, scheduled-room reminders…) and the BullMQ push consumer.
Today they all run in one process; splitting them means a burst of pushes or a heavy digest run
can't slow request handling, and you can scale them independently.

### The code changes (small, backwards-compatible)

**1. `src/common/runtime-role.ts`** (new)

```ts
// ROLE unset (single instance) -> this process does everything, exactly as before.
// ROLE=web    -> HTTP only: no @Cron jobs, no BullMQ worker (can still enqueue).
// ROLE=worker -> no HTTP: runs @Cron jobs + the BullMQ worker.
const ROLE = process.env.ROLE ?? '';
export const isWebRole = () => ROLE === '' || ROLE === 'web';
export const isWorkerRole = () => ROLE === '' || ROLE === 'worker';
```

**2. `src/main.ts`** — at the end of `bootstrap()`:

```ts
import { isWorkerRole } from './common/runtime-role';
// ...
if (process.env.ROLE === 'worker') {
  await app.init();                        // DI + schedulers + BullMQ, no HTTP port
  console.log('Worker role: HTTP disabled, background jobs active');
} else {
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
}
```

**3. `src/push/push-queue.service.ts`** — in `onModuleInit`, only start the `Worker` when
`isWorkerRole()`; always create the `Queue` (so the web side can still `add(...)` jobs).

**4. Every `@Cron` method** (`digest.service.ts`, `gamification`/recap, `rooms.service.ts`
`sendScheduledReminders`, `events/event-reminder.service.ts`, `calendar-events`): first line

```ts
if (!isWorkerRole()) return;
```

so a split web instance doesn't double-fire them.

> With `ROLE` unset, `isWorkerRole()` returns `true` and `main.ts` still calls `app.listen()` —
> **nothing changes for a single instance.** The split only activates when you explicitly set
> `ROLE=web` on one service and `ROLE=worker` on the other.

### Test it locally

Add a `worker` service to `docker-compose.yml` under `profiles: ["app"]`:

```yaml
  worker:
    profiles: ["app"]
    build: { context: ./collegesocialbackend/college-social-backend, target: dev }
    command: sh -c "npm ci && ROLE=worker node dist/main"   # or nest start for watch
    env_file: ./collegesocialbackend/college-social-backend/.env
    environment: { MONGODB_URI: mongodb://mongo:27017/college-social, REDIS_URL: redis://redis:6379, ROLE: worker }
    volumes: [ ./collegesocialbackend/college-social-backend:/app, backend-deps:/app/node_modules ]
    depends_on: [mongo, redis]
    init: true
    mem_limit: 500m
```

`docker compose --profile app up` — the `worker` logs "Worker role: HTTP disabled" and binds no
port; the `backend` logs the normal HTTP line. Fire a notification and confirm the push job is
picked up by the worker.

> Ask me to apply changes 1–4 when you reach this phase — they're mechanical but touch ~6 files.

---

## Phase 4 — switch the Render service to Docker  ·  ~30 min

Same service, same URL, same env vars, same disk, same Redis (Render Key Value) — the **only**
change is *how Render builds it*: the Node buildpack → your `Dockerfile`. Nothing about MongoDB,
Cloudinary, secrets, or the Vercel frontend moves. Rollback is one click.

### Before you push: prove the image locally

Do **Phase 2** first (`docker build` + `docker run --env-file .env`). If `/api` returns 200 in a
local container and a file conversion runs through LibreOffice, the Render build will behave the
same — it uses the identical `Dockerfile` and `.dockerignore`.

### The change (already in `render.yaml`)

The Blueprint is done — `collegesocialbackend/college-social-backend/render.yaml` now has:

```yaml
    runtime: docker            # was: node
    dockerfilePath: ./Dockerfile
    dockerContext: .
    # buildCommand / startCommand removed — the Dockerfile owns build + CMD
    # NODE_VERSION env removed — the image pins Node 22
```

`disk`, `healthCheckPath: /api`, and every `envVars` entry are untouched. Render keeps using
`healthCheckPath` (not the Dockerfile `HEALTHCHECK`) and respects `.dockerignore`.

### Apply it — two ways, pick one

**A. Blueprint sync (if your repo's `render.yaml` is a connected Blueprint).**
Commit + push to `main`. Render detects the runtime change, rebuilds the **existing** service from
the Dockerfile, and cuts over when `/api` passes the health check. Watch **Logs** for
`Nest application successfully started`.

**B. Dashboard (always works, most explicit).**
Render dashboard → the backend service → **Settings**:
- **Build & Deploy → Runtime**: `Node` → `Docker`
- **Dockerfile Path**: `Dockerfile` (it's relative to the Root Directory, already
  `collegesocialbackend/college-social-backend`)
- Clear the **Build Command** and **Start Command** fields
- **Environment**: delete `NODE_VERSION`
- Save → **Manual Deploy → Deploy latest commit**

First Docker build on `starter` runs ~6–12 min (installs LibreOffice + fonts). Later deploys
reuse layer cache and are faster.

### Verify (5 min)

```bash
curl -i https://<your-service>.onrender.com/api        # HTTP 200
```
Then in the app: login, send a chat message (WebSocket upgrades over the same port — no Render
config), fire a push, and — the point of the switch — run a **PDF → Word conversion** and confirm
the log shows the LibreOffice path, not `Adobe fallback`.

### Rollback

- **Dashboard → the service → "Rollback"** to the previous deploy — instant, no rebuild.
- Or `git revert` the `render.yaml` commit and push — Render rebuilds on the Node buildpack.

Either way the disk, env vars, and Redis instance are never touched, so there's nothing to
restore.

### Optional: the Phase 3 worker as a second Render service

Only after the Phase 3 code (`ROLE` gating) is merged. Add to `render.yaml`:

```yaml
  - type: worker
    name: college-social-worker
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .
    plan: starter
    envVars:
      - { key: ROLE, value: worker }
      # every other secret the web service has (MONGODB_URI, REDIS_URL, VAPID_*, SMTP_*, …)
```

Then set `ROLE=web` on the existing service. Until `ROLE` gating is in the code, **don't** add
this — a second instance would double-fire every `@Cron`.

### Later, if builds get slow: build in CI, deploy the artifact

`.github/workflows/docker.yml` builds + pushes to GHCR with layer cache, then hits a Render
**"Deploy an existing image"** hook — moves the ~10 min build off Render's starter box.

```yaml
name: backend image
on: { push: { branches: [main], paths: ['collegesocialbackend/**'] } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: ./collegesocialbackend/college-social-backend
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/iaems-backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      # then: curl the Render deploy hook with imgURL=ghcr.io/...:${{ github.sha }}
```

The frontend stays on **Vercel** — edge deploys + per-PR previews with zero Docker. Only
containerize it to add it to the local compose stack (needs `output: 'standalone'` in
`next.config.js`).

---

## Command cheat sheet

```bash
docker compose up redis            # start just Redis (foreground)
docker compose up -d               # start redis + mongo in the background
docker compose --profile app up    # + backend (and worker, once added)
docker compose ps                  # what's running
docker compose logs -f redis       # tail one service's logs
docker compose stop                # stop everything, keep data
docker compose down                # stop + remove containers, keep volumes
docker compose down -v             # ... and wipe the volumes (fresh DB next time)

docker build -t iaems-backend ./collegesocialbackend/college-social-backend
docker run --rm -p 3001:3001 --env-file collegesocialbackend/college-social-backend/.env --init iaems-backend
docker ps                          # running containers + health
docker exec -it <name> sh          # shell inside a running container
docker system df                   # disk used by Docker
docker system prune -a             # reclaim space (removes unused images/cache)
```

## Recommendation

Do **Phase 1a today** (Redis in Docker, app native) — an hour of value for ten minutes of work.

**Phase 4 (switch Render to Docker) is worth doing** for one concrete reason: the file converter
runs at full fidelity instead of the Adobe fallback, because the image ships LibreOffice + Poppler
+ Arabic fonts that the Node buildpack can't install. It also freezes the build (Node 22,
`legacy-peer-deps`, native modules) so a deploy can't drift. It does **not** make the app's code
faster — that's `REDIS_URL` + `ATLAS_SEARCH` (Phase 1 unlocks testing them) and the Phase 3
worker split.

Leave Phase 3 (worker split) until a heavy digest run or a push burst is actually competing with
request handling. A `Dockerfile` is one more thing to keep working; Phase 4 earns its keep now,
Phase 3 earns it later.
