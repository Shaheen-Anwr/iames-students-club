import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

// Guards POST /api/broadcast/release. No JWT -- this endpoint is called by the repo's post-commit
// git hook, which has no user session. Auth is a single shared secret sent as `x-broadcast-key`,
// compared in constant time. If BROADCAST_API_KEY isn't configured the endpoint is simply off.
@Injectable()
export class ReleaseKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.config.get<string>('broadcast.apiKey') ?? '';
    if (!configured) {
      throw new ServiceUnavailableException('ميزة بث التحديثات غير مُفعّلة على الخادم');
    }

    const header = context.switchToHttp().getRequest<Request>().header('x-broadcast-key') ?? '';
    const a = Buffer.from(header);
    const b = Buffer.from(configured);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('مفتاح البث غير صالح');
    }
    return true;
  }
}
