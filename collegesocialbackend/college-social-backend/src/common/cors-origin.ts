// Vercel gives one project many valid origins -- the production alias, the git-branch alias,
// and a fresh one per preview deployment -- so pinning CORS to one exact string (via CORS_ORIGIN)
// is fragile and breaks the moment someone opens a different alias than the one that happens to
// be configured. Matching a pattern instead means any of this project's Vercel URLs just works,
// with no dashboard env var to keep in sync.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/iames-students-club(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/localhost:3000$/,
];

export function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin header at all means a non-browser caller (curl, server-to-server, same-origin) --
  // nothing to check against, so allow it.
  if (!origin) return true;
  if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

// Adapts isAllowedOrigin to the (origin, callback) shape both @nestjs/common's enableCors()
// and Socket.IO's gateway `cors` option expect (they both delegate to the `cors` npm package).
export function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  callback(null, isAllowedOrigin(origin));
}
