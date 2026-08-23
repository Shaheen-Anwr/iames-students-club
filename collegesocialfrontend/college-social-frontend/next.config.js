// Server-only (not NEXT_PUBLIC_*, never shipped to the browser bundle) -- the actual backend
// this proxies to. Defaults to the deployed Render backend so no Vercel dashboard config is
// required, matching this repo's existing zero-manual-setup env convention.
const API_PROXY_ORIGIN = process.env.API_PROXY_ORIGIN || 'https://iames-students-club.onrender.com';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxies /api/* through this server's own origin so the browser's connection to the API is
  // always same-site, even though the real backend lives on a different domain. Without this,
  // the refresh-token cookie (SameSite=None; Secure) is a genuine cross-site cookie that Safari
  // blocks by default and other browsers increasingly restrict -- when dropped, silent token
  // refresh fails and a stale/expired access token surfaces as a raw 401 (most visibly on
  // uploads, since they're usually the last step of a longer flow).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_PROXY_ORIGIN}/api/:path*` }];
  },
};

module.exports = nextConfig;
