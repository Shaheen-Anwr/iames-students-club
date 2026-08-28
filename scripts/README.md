# Release notification on commit

Push a one-off Web Push notification to **every subscribed user** when you ship something, driven
straight from your commit message. Fully opt-in — nothing is sent unless the commit message asks
for it.

## How it works

1. `.githooks/post-commit` runs after every commit. It looks for a line in the commit message:

   ```
   Notify-Users: <the text users should see>
   Notify-Title: <optional custom title, defaults to "📢 تحديث جديد في المنصة">
   ```

   No `Notify-Users:` line → the hook does nothing.

2. If present, it runs `scripts/notify-release.mjs`, which POSTs to the backend's
   `POST /api/broadcast/release` (auth: the `BROADCAST_API_KEY` shared secret).

3. `BroadcastService` fans a Web Push out to all users who have push enabled. It does **not**
   create an in-app announcement or notification row — it's a lightweight "go look" nudge.
   The notification click opens `/feed` (override with a `--url` / `url` value).

## One-time setup

```sh
# from the repo root
git config core.hooksPath .githooks

cp scripts/notify-release.env.example scripts/notify-release.env
# then edit scripts/notify-release.env:
#   BROADCAST_URL      = https://<your-backend-host>/api/broadcast/release
#   BROADCAST_API_KEY  = same value as the backend's BROADCAST_API_KEY env var
```

On the backend, set `BROADCAST_API_KEY` (e.g. `openssl rand -hex 32`). Leave it blank to keep the
endpoint disabled (it returns 503).

## Usage

```
git commit -m "feat: faster large video uploads

Notify-Users: رفع الفيديوهات الكبيرة صار أسرع بكثير — جرّب ترفع مقطع طويل 🎬"
```

Or send manually, without committing:

```sh
node scripts/notify-release.mjs --body "بثّ مباشر جديد الليلة الساعة 8"
node scripts/notify-release.mjs --from-head        # re-read the last commit's trailer
```

Requires push to be configured on the backend (`VAPID_*`). If it isn't, the endpoint responds
`{ enabled: false, ... }` and nothing is sent.
