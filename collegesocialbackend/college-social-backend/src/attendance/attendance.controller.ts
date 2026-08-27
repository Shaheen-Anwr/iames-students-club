import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AttendanceService } from './attendance.service';
import { SetAttendanceDto } from './dto/set-attendance.dto';

// Personal lecture-attendance log, driven by the student's own published weekly schedule.
// Fully owner-scoped -- every route acts on the caller only.
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // GET /api/attendance/week?start=YYYY-MM-DD (the week's first day, normally a Saturday)
  @Get('week')
  async week(@CurrentUser() user: AuthenticatedUser, @Query('start') start?: string) {
    const startIso = start ?? new Date().toISOString();
    return this.attendanceService.getWeek(user.userId, startIso);
  }

  // GET /api/attendance/summary -> all-time attendance % per course + overall
  @Get('summary')
  async summary(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getSummaryForOwner(user.userId);
  }

  // PUT /api/attendance { scheduleEntryId, date, status } -> upsert the mark for one occurrence.
  // status: null clears it.
  @Put()
  async set(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAttendanceDto) {
    return this.attendanceService.setStatus(user.userId, dto);
  }
}
