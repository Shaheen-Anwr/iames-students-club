import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../types/authenticated-user.type';

interface JwtPayload {
  sub: string;
  collegeId: string;
  role: string;
  department: string | null;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
