/**
 * Cloudflare Worker: caching reverse-proxy for Cloudinary media.
 *
 * WHY: Cloudinary's free tier caps at ~25 GB/month of delivery bandwidth. This Worker sits in
 * front of `res.cloudinary.com` and caches every response at Cloudflare's edge, so the second
 * (and every subsequent) view of any image/video is served from the CDN and never counts against
 * the Cloudinary quota. Cloudinary assets are immutable (the URL changes when the file changes),
 * so a long edge TTL is safe.
 *
 * DEPLOY (no custom domain required):
 *   Option 1 - dashboard: Workers & Pages -> Create -> "Hello World" -> paste this -> Deploy.
 *     You get a URL like  https://media-proxy.<your-subdomain>.workers.dev
 *   Option 2 - CLI:  npm i -g wrangler && wrangler deploy   (uses ./wrangler.toml)
 *
 * THEN in the frontend (.env.production on Vercel):
 *   NEXT_PUBLIC_MEDIA_PROXY=https://media-proxy.<your-subdomain>.workers.dev
 * and redeploy. `lib/media.ts` rewrites every res.cloudinary.com URL to go through here.
 * Leave the var unset -> nothing changes, media goes straight to Cloudinary as today.
 *
 * URL shape:
 *   https://media-proxy.<sub>.workers.dev/<cloud-name>/image/upload/f_auto,q_auto/lectures/x.jpg
 *     -> https://res.cloudinary.com/<cloud-name>/image/upload/f_auto,q_auto/lectures/x.jpg
 */

const ORIGIN = 'https://res.cloudinary.com';
const EDGE_TTL = 60 * 60 * 24 * 30; // 30 days
// Only proxy Cloudinary's real delivery paths -- refuse anything else so the Worker can't be
// used as an open proxy.
const ALLOWED = /^\/[^/]+\/(image|video|raw)\/(upload|fetch|authenticated)\//;

export default {
  async fetch(request, _env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (!ALLOWED.test(url.pathname)) {
      return new Response('Not a Cloudinary delivery path', { status: 400 });
    }

    const originUrl = ORIGIN + url.pathname + url.search;
    const cache = caches.default;
    const cacheKey = new Request(originUrl, { method: 'GET' });

    let response = await cache.match(cacheKey);
    if (response) {
      response = new Response(response.body, response);
      response.headers.set('X-Media-Proxy', 'HIT');
      return response;
    }

    response = await fetch(originUrl, {
      cf: { cacheEverything: true, cacheTtl: EDGE_TTL },
      headers: { Accept: request.headers.get('Accept') || '*/*' },
    });

    // Don't cache errors.
    if (!response.ok) return response;

    response = new Response(response.body, response);
    response.headers.set('Cache-Control', `public, max-age=${EDGE_TTL}, immutable`);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('X-Media-Proxy', 'MISS');
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
