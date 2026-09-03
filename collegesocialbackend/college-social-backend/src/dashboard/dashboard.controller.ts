import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DashboardService } from './dashboard.service';

// Aggregates a signed-in student's "today at a glance" view -- today's schedule, due-soon
// assignments/planner tasks, top-5 leaderboard, and recent announcements -- into one call so the
// home page has a single loading state instead of 5+ separate round trips.
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getDashboard(user);
  }

  // GET /api/dashboard/study -> { gpa, attendance, assignments } for the progress dashboard,
  // one round trip instead of three.
  @Get('study')
  async study(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getStudyDashboard(user);
  }
}
