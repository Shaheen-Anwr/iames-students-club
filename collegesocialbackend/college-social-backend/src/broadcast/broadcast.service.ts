import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushService } from '../push/push.service';
import { PushPayload } from '../push/push-payload.util';
import { ReleaseBroadcastDto } from './dto/release-broadcast.dto';

const DEFAULT_TITLE = '📢 تحديث جديد في المنصة';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  // Push-only, author-less, platform-wide. Fired by the post-commit git hook when a commit message
  // carries a `Notify-Users:` line. Deliberately does NOT create an Announcement/notification row --
  // it's a lightweight "something new shipped, go look" nudge.
  async release(dto: ReleaseBroadcastDto): Promise<{ enabled: boolean; users: number; sent: number; failed: number }> {
    const frontendUrl = this.config.get<string>('frontendUrl')!;
    const payload: PushPayload = {
      title: dto.title?.trim() || DEFAULT_TITLE,
      body: dto.body.trim(),
      url: dto.url?.trim() || `${frontendUrl}/feed`,
      icon: `${frontendUrl}/icons/icon-192.png`,
      // Constant tag: a device that receives two release pings collapses them to one.
      tag: 'platform-update',
    };

    const result = await this.pushService.broadcastToAll(payload);
    this.logger.log(
      `Release broadcast "${payload.body}" -> enabled=${result.enabled} users=${result.users} sent=${result.sent} failed=${result.failed}`,
    );
    return result;
  }
}
