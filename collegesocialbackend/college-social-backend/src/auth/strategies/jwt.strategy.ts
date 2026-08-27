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
// the access token so normal API calls can read it back into an Authorization header -- but that
// same readability means the browser also sends it automatically as a cookie on same-site requests
// that can't carry a custom header at all, like an <iframe>/<img>/<a> pointed straight at a backend
// route (see PostsController's GET :id/attachment, embedded/downloaded without any JS in the loop).
const ACCESS_TOKEN_COOKIE = 'college_social_token';

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Tried in order -- the Authorization header (used by every normal fetch/XHR call, see
      // lib/api.ts) takes precedence; the cookie is only a fallback for markup-driven requests.
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), extractFromCookie]),
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
