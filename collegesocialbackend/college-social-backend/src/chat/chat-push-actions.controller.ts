import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { verifyPushActionToken } from '../push/push-action-token';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { PushActionDto } from './dto/push-action.dto';

const MUTE_MINUTES = 60;

// The buttons on a chat notification ("تمت القراءة" / "كتم ساعة"), called from sw.js. The service
// worker has no session, so instead of a JWT this takes the signed token the push itself carried
// (push-action-token.ts) -- good for one user and one conversation, for a few days.
@Controller('chat')
export class ChatPushActionsController {
  constructor(
    private readonly chatService: ChatService,
    private readonly gateway: ChatGateway,
    private readonly config: ConfigService,
  ) {}

  @Post('push-action')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async act(@Body() dto: PushActionDto) {
    const claims = verifyPushActionToken(this.config.get<string>('jwt.secret')!, dto.token);
    if (!claims) throw new UnauthorizedException('انتهت صلاحية هذا الإشعار');

    if (dto.action === 'read') {
      // Same as the socket's markRead: senders see their ticks turn blue.
      const messageIds = await this.chatService.markRead(claims.c, claims.u);
      if (messageIds.length) {
        this.gateway.server
          .to(`conversation:${claims.c}`)
          .emit('messagesRead', { conversationId: claims.c, userId: claims.u, messageIds });
      }
    } else {
      await this.chatService.muteConversation(claims.c, claims.u, MUTE_MINUTES); // groups only
    }
    return { ok: true };
  }
}
