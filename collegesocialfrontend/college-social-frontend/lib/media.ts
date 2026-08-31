// Routes Cloudinary media URLs through a Cloudflare edge cache when NEXT_PUBLIC_MEDIA_PROXY is
// set (a Worker or custom hostname that reverse-proxies res.cloudinary.com -- see
// /cloudflare/media-proxy.worker.js). The point: Cloudinary's free tier caps delivery bandwidth
// at ~25 GB/month; once the edge has an asset, repeat views are served from Cloudflare and never
// touch that quota.
//
// No-op when the env var is unset, and for any non-Cloudinary URL -- always safe to wrap.

const PROXY = process.env.NEXT_PUBLIC_MEDIA_PROXY?.replace(/\/+$/, '');
const CLOUDINARY = 'https://res.cloudinary.com';

export function viaCdn(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (!PROXY || !url.startsWith(CLOUDINARY)) return url;
  return PROXY + url.slice(CLOUDINARY.length);
}
