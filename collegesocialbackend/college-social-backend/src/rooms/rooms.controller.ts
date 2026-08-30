import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RoomsService } from './rooms.service';

type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rooms.get(user, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string; topic?: string }) {
    return this.rooms.create(user, body?.name, body?.topic);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rooms.join(user, id);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rooms.leave(user, id);
  }

  @Post(':id/timer')
  timer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { action: TimerAction; focusMin?: number; breakMin?: number },
  ) {
    return this.rooms.setTimer(user, id, body?.action, { focusMin: body?.focusMin, breakMin: body?.breakMin });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.rooms.remove(user, id);
    return { success: true };
  }
}
