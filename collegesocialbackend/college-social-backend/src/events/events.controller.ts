import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // GET /api/events?scope=upcoming|past&page=1&limit=20
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.events.list(user, scope === 'past' ? 'past' : 'upcoming', Number(page) || 1, Number(limit) || 20);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Post(':id/rsvp')
  rsvp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.events.rsvp(user, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.events.remove(user, id);
    return { success: true };
  }
}
