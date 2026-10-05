import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UsersService } from '../users/users.service';
import { ChatAiService } from './chat-ai.service';
import { ChatRewriteDto, ChatSummaryDto, ChatTranslateDto } from './dto/chat-ai.dto';

// AI tools inside personal chats. Each hit is one provider call, so every route carries a much
// tighter per-user throttle than the global default.
@UseGuards(JwtAuthGuard)
@Controller('ai/chat')
export class ChatAiController {
  constructor(
    private readonly chatAi: ChatAiService,
    private readonly usersService: UsersService,
  ) {}

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('conversations/:id/summary')
  async summarize(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ChatSummaryDto) {
    return this.chatAi.summarize(id, user.userId, await this.displayName(user.userId), dto.sinceMessageId);
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('conversations/:id/replies')
  async replies(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatAi.suggestReplies(id, user.userId, await this.displayName(user.userId));
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('rewrite')
  async rewrite(@Body() dto: ChatRewriteDto) {
    return this.chatAi.rewrite(dto.text, dto.mode);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('messages/:id/translate')
  async translate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ChatTranslateDto) {
    return this.chatAi.translateMessage(id, user.userId, dto.target);
  }

  // Whisper call + audio download per hit (cached after the first, though).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('messages/:id/transcribe')
  async transcribe(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatAi.transcribe(id, user.userId);
  }

  private async displayName(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId).catch(() => null);
    return user?.name ?? 'الطالب';
  }
}
