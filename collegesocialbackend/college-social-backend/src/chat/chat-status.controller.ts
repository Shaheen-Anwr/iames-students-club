import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { ChatStatusService } from './chat-status.service';
import { CreateChatStatusDto } from './dto/create-chat-status.dto';
import { StatusReactDto, StatusReplyDto } from './dto/status-interaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat/statuses')
export class ChatStatusController {
  constructor(
    private readonly statuses: ChatStatusService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.statuses.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateChatStatusDto) {
    return this.statuses.create(user.userId, input);
  }

  // Called as each story is shown -- frequent, so a roomier limit than the default.
  @Post(':id/view')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  view(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.statuses.view(user.userId, id);
  }

  @Get(':id/viewers')
  viewers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.statuses.viewers(user.userId, id);
  }

  @Post(':id/reply')
  async reply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: StatusReplyDto) {
    return this.deliver(await this.statuses.reply(user.userId, id, dto.text), user.userId);
  }

  @Post(':id/react')
  async react(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: StatusReactDto) {
    return this.deliver(await this.statuses.react(user.userId, id, dto.emoji), user.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.statuses.remove(user.userId, id);
  }

  // Same as a socket send: both sides' live sockets join the chat (it may be brand new) and get it.
  private deliver(result: { message: unknown; conversationId: string; authorId: string }, viewerId: string) {
    this.realtimeEmitter.joinUserToConversation(viewerId, result.conversationId);
    this.realtimeEmitter.joinUserToConversation(result.authorId, result.conversationId);
    this.realtimeEmitter.emitToConversation(result.conversationId, 'newMessage', result.message);
    return result.message;
  }
}
