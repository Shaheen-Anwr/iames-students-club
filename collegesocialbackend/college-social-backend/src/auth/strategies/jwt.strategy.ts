import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user.type';

interface JwtPayload {
  sub: string;
  collegeId: string;
  role: string;
  department: string | null;
  sid: string;
}

// Must match lib/api.ts's TOKEN_COOKIE on the frontend. Plain (non-httpOnly) cookie set alongside
// the access token so normal API calls can read it back into an Authorization header. Kept as a
// fallback for markup-driven requests (<iframe>/<img>/<a> pointed straight at a backend route, e.g.
// PostsController's GET :id/attachment, which can't carry a custom header) -- but NOT relied on as
// the only fallback: in production the frontend's own domain (Vercel) rewrite-proxies /api/* to a
// *different* domain (Render), and confirmed in the field that this cookie does not reliably survive
// that hop even though it's set same-site from the browser's own point of view. The query-string
// token below is what actually works regardless of any proxy's cookie-forwarding behavior, since the
// frontend embeds it directly -- this cookie extractor is left in only as a harmless second chance.
const ACCESS_TOKEN_COOKIE = 'college_social_token';

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

// See postAttachmentUrl() in the frontend's lib/api.ts -- it appends the caller's own current access
// token as ?token=... on a 'lecture'/'file' attachment link/embed, since that's the one call site
// that can't attach a normal Authorization header (plain markup, not a JS fetch). Short-lived (same
// 15-minute expiry as any other access token) and no more exposed than the cookie above, which is
// already plain, non-httpOnly, and JS-readable by design.
function extractFromQuery(req: Request): string | null {
  const token = req?.query?.token;
  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Tried in order -- the Authorization header (used by every normal fetch/XHR call, see
      // lib/api.ts) takes precedence; the other two are fallbacks for markup-driven requests.
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), extractFromCookie, extractFromQuery]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  // Whatever this returns becomes req.user
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      userId: payload.sub,
      collegeId: payload.collegeId,
      role: payload.role as AuthenticatedUser['role'],
      department: payload.department as AuthenticatedUser['department'],
      sessionId: payload.sid,
    };
  }
}
