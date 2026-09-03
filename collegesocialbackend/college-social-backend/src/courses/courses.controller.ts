import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CoursesService } from './courses.service';

@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // GET /api/courses/:code/overview -> { lectures, assignments, questions, quizzes, slots }
  // Single aggregate for the course hub; replaces the client's 5-way Promise.allSettled. The
  // server-side CacheService (short TTL) does the DB relief; no HTTP Cache-Control here on
  // purpose -- fetch() honours it and would serve stale data for the window after a mutation.
  @Get(':code/overview')
  async overview(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.getOverview(code, user);
  }
}
