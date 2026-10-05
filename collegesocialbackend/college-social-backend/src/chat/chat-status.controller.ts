import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ChatStatusService } from './chat-status.service';
import { CreateChatStatusDto } from './dto/create-chat-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat/statuses')
export class ChatStatusController {
  constructor(private readonly statuses: ChatStatusService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.statuses.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateChatStatusDto) {
    return this.statuses.create(user.userId, input);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.statuses.remove(user.userId, id);
  }
}
