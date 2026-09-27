import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

// Same cookie name as JwtStrategy / the frontend's lib/api.ts TOKEN_COOKIE.
const ACCESS_TOKEN_COOKIE = 'college_social_token';

/**
 * Rate-limits signed-in traffic per *user* instead of per IP.
 *
 * Every browser request reaches this backend through the frontend's `/api` rewrite proxy (and
 * students on campus Wi-Fi sit behind one NAT), so an IP key lumps many unrelated users into one
 * bucket -- a busy route like the feed or a like button would start returning 429s to everyone at
 * once as the user base grows. With a valid access token the bucket is `u:<userId>` instead.
 *
 * The token is signature-verified (cheap HMAC) so a forged `sub` can't be used to rotate buckets.
 * Anything without a valid token -- login, register, password reset, expired tokens -- keeps the
 * stock per-IP tracker, so brute-force protection on the auth routes is unchanged.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  @Inject(JwtService) private readonly jwt!: JwtService;

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = extractToken(req);
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
        if (payload?.sub) return `u:${payload.sub}`;
      } catch {
        // Expired/invalid -- fall through to IP; the auth guard will reject the request anyway.
      }
    }
    return super.getTracker(req);
  }
}

function extractToken(req: Record<string, any>): string | null {
  const header: unknown = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  const cookie: unknown = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookie === 'string' && cookie) return cookie;
  const query: unknown = req.query?.token;
  return typeof query === 'string' && query ? query : null;
}
