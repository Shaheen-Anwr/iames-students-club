// Service worker: Web Push + an offline layer.
//
// Hand-rolled (no Workbox) to stay dependency- and build-step-free. Strategy:
//   - immutable hashed build assets (/_next/static/**, images, fonts) -> cache-first
//   - page navigations -> network-first, fall back to the last-seen copy, then /offline.html
//   - /api/** -> never touched (auth'd, multi-user device, must stay fresh)
//   - anything cross-origin (Cloudinary media, etc.) -> untouched
//
// Bump VERSION on any change here so `activate` drops the old caches.

const VERSION = 'v7';
const STATIC_CACHE = `iaems-static-${VERSION}`;
const PAGES_CACHE = `iaems-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
// Not versioned: "when did this chat last ring" must survive service-worker updates.
const NOTIFY_CACHE = 'iaems-notify-state';
const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE && k !== NOTIFY_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const ASSET_RE = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico)$/i;

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirstPage(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(PAGES_CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only ever touch real http(s) requests. A download that iOS turns into a navigation to a
  // blob:/data: URL must reach the browser untouched -- if we intercept it we can't fetch it
  // from here and end up serving offline.html over the app.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  }
});

// Let the page trigger an immediate activation of a waiting SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ------------------------------- Web Push -------------------------------- */

// A chat push carries `conversationId` and a per-conversation `tag` (chat-<id>), so each chat
// gets one notification that updates in place, worded like a messenger (sender / group name,
// "Name: message" lines, the sender's photo, the message's photo). Several unread messages stack
// into that notification's body. Ringing:
//   - private chats and @mentions ring (sound, vibration, pop-up) on every message;
//   - a group rings at most once per GROUP_QUIET_MS -- later messages in that window update the
//     notification silently ("+3" and the newest lines), so a busy class group can't buzz all day
//     and push people into blocking notifications altogether.
// While the app is open in front of the user the page plays its own sound and shows its chat
// bubble instead (ChatAlertsHost), so a chat push is skipped then -- Chrome only forces a
// notification when no window of the site is visible.
const GROUP_QUIET_MS = 3 * 60 * 1000;

const notifyKey = (tag) => `/__notify/${encodeURIComponent(tag)}`;

async function lastRangAt(tag) {
  try {
    const hit = await (await caches.open(NOTIFY_CACHE)).match(notifyKey(tag));
    return hit ? Number(await hit.text()) || 0 : 0;
  } catch {
    return 0;
  }
}

async function rememberRing(tag, at) {
  try {
    await (await caches.open(NOTIFY_CACHE)).put(notifyKey(tag), new Response(String(at)));
  } catch {
    /* storage full / unavailable: worst case the next group message rings too */
  }
}

async function forgetRing(tag) {
  try {
    await (await caches.open(NOTIFY_CACHE)).delete(notifyKey(tag));
  } catch {
    /* ignore */
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(showPush(data));
});

async function showPush(data) {
  if (data.conversationId) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((c) => c.visibilityState === 'visible' && c.focused)) return;
  }

  let lines = [data.body || ''];
  let count = 1;
  if (data.conversationId && data.tag) {
    const [previous] = await self.registration.getNotifications({ tag: data.tag });
    if (previous?.data?.lines) {
      lines = [...previous.data.lines, data.body || ''].slice(-5);
      count = (previous.data.count || 1) + 1;
    }
  }

  const now = Date.now();
  const quiet = Boolean(data.group && !data.mention && data.tag) && now - (await lastRangAt(data.tag)) < GROUP_QUIET_MS;
  if (data.tag && !quiet) await rememberRing(data.tag, now);

  // Two buttons (Chrome's limit). Web notifications can't take typed replies, so "رد" opens the
  // chat with the keyboard up; the others act without opening the app (POST /api/chat/push-action).
  const actions = data.actionToken
    ? data.group
      ? [
          { action: 'read', title: 'تمت القراءة' },
          { action: 'mute', title: 'كتم ساعة' },
        ]
      : [
          { action: 'reply', title: 'رد' },
          { action: 'read', title: 'تمت القراءة' },
        ]
    : [];

  const options = {
    body: lines.filter(Boolean).join('\n'),
    icon: data.icon,
    // Android draws the status-bar icon from this image's alpha channel -- a white silhouette.
    badge: '/icons/badge-96.png',
    tag: data.tag,
    renotify: Boolean(data.tag) && !quiet,
    // Chat stays on screen until the user acts on it (desktop; a phone keeps it in the shade).
    requireInteraction: Boolean(data.conversationId),
    silent: quiet,
    timestamp: now,
    lang: 'ar',
    dir: 'rtl',
    actions,
    data: { url: data.url, conversationId: data.conversationId || null, lines, count, actionToken: data.actionToken || null },
  };
  // A silent notification may not carry a vibration pattern (Chrome rejects it).
  if (!quiet) options.vibrate = [180, 80, 180];
  if (data.image) options.image = data.image;

  return self.registration.showNotification(count > 1 ? `${data.title} (${count})` : data.title, options);
}

// Tapping a notification lands in the installed app, not a browser tab. The target is rebuilt on
// this worker's own origin (always inside the manifest scope, whatever host the backend put in the
// payload); an open app window is reused (client-side route change, no reload); and on a phone a
// plain browser tab is never picked -- clients.openWindow() launches the installed app there.
// The "تمت القراءة" / "كتم ساعة" buttons act right here without opening anything.
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  if ((event.action === 'read' || event.action === 'mute') && data.actionToken) {
    event.waitUntil(
      fetch('/api/chat/push-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: data.actionToken, action: event.action }),
      })
        .catch(() => undefined)
        .then(() => (data.conversationId ? forgetRing(`chat-${data.conversationId}`) : undefined)),
    );
    return;
  }

  const raw = data.url;
  if (!raw) return;
  let url;
  try {
    const parsed = new URL(raw, self.location.origin);
    if (event.action === 'reply') parsed.searchParams.set('reply', '1');
    url = new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, self.location.origin).href;
  } catch {
    return;
  }

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const modes = await Promise.all(clientList.map(displayMode));
      const app = clientList.find((_, i) => modes[i] === 'standalone');
      const phone = /Android|iPhone|iPad|iPod/i.test(self.navigator.userAgent);
      const target = app || (phone ? null : clientList[0]);
      if (target) {
        await target.focus();
        if (target.url !== url) target.postMessage({ type: 'notification-click', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Asks an open page whether it's running as the installed app (pages answer from ChatAlertsHost).
// One that doesn't answer in time -- an old version, a frozen tab -- counts as a browser tab.
function displayMode(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve('unknown'), 250);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data?.mode || 'unknown');
    };
    try {
      client.postMessage({ type: 'display-mode?' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve('unknown');
    }
  });
}
