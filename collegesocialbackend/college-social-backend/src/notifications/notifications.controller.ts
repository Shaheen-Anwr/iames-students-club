import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notificationsService.listForUser(user.userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notificationsService.unreadCount(user.userId) };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markRead(id, user.userId);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllRead(user.userId);
    return { success: true };
  }
}
