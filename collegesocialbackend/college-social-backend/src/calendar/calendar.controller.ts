import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CalendarService } from './calendar.service';

@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // GET /api/calendar?month=1-12&year=YYYY -- defaults to the current month/year if omitted.
  @Get()
  async getEvents(@CurrentUser() user: AuthenticatedUser, @Query('month') month?: string, @Query('year') year?: string) {
    const now = new Date();
    const resolvedMonth = Number(month) || now.getMonth() + 1;
    const resolvedYear = Number(year) || now.getFullYear();
    return this.calendarService.getEvents(user.userId, user.department, resolvedMonth, resolvedYear);
  }
}
