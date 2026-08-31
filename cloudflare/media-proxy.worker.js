/**
 * Cloudflare Worker: caching reverse-proxy for Cloudinary media (images + video).
 *
 * WHY: Cloudinary's free tier caps at ~25 GB/month of delivery bandwidth. This Worker sits in
 * front of `res.cloudinary.com` so the second (and every subsequent) view of any asset is served
 * from Cloudflare's edge and never counts against the Cloudinary quota. Cloudinary URLs are
 * immutable (the URL changes when the file changes), so a long edge TTL is safe.
 *
 * DEPLOY (no custom domain required):
 *   Option 1 - dashboard: Workers & Pages -> your worker -> Edit code -> paste -> Deploy.
 *   Option 2 - CLI:  cd cloudflare && npx wrangler deploy
 *   -> URL:  https://media-proxy.<your-subdomain>.workers.dev
 *
 * THEN in the frontend's committed .env.production:
 *   NEXT_PUBLIC_MEDIA_PROXY=https://media-proxy.<your-subdomain>.workers.dev
 * and redeploy. `lib/media.ts` rewrites every res.cloudinary.com URL (image AND video) through
 * here. Unset the var -> media goes straight to Cloudinary, exactly as before.
 *
 * VIDEO: a <video> element sends `Range:` requests when seeking. Those are forwarded to the
 * origin and NOT stored in the Worker's manual cache (partial responses can't be), but the
 * underlying full asset is still edge-cached by Cloudflare via `cf.cacheEverything`, which is
 * fully range-aware. Net effect: video is cached too, seeking works.
 */

const ORIGIN = 'https://res.cloudinary.com';
const EDGE_TTL = 60 * 60 * 24 * 30; // 30 days
// Only proxy Cloudinary's real delivery paths -- refuse anything else so this can't be used as
// an open proxy.
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
    const range = request.headers.get('Range');
    const cache = caches.default;
    const cacheKey = new Request(originUrl, { method: 'GET' }); // canonical key, no Range

    // Manual edge cache for non-range GETs (images, thumbnails). Range requests (video seeking)
    // skip this layer -- Cloudflare's built-in range-aware CDN cache (cf.cacheEverything below)
    // handles those.
    if (!range) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const r = new Response(hit.body, hit);
        r.headers.set('X-Media-Proxy', 'HIT');
        return r;
      }
    }

    const originHeaders = { Accept: request.headers.get('Accept') || '*/*' };
    if (range) originHeaders.Range = range;

    let response = await fetch(originUrl, {
      cf: { cacheEverything: true, cacheTtl: EDGE_TTL },
      headers: originHeaders,
    });

    if (response.status !== 200 && response.status !== 206) return response; // don't cache errors

    response = new Response(response.body, response);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('X-Media-Proxy', range ? 'RANGE' : 'MISS');

    if (response.status === 200) {
      response.headers.set('Cache-Control', `public, max-age=${EDGE_TTL}, immutable`);
      if (!range) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
