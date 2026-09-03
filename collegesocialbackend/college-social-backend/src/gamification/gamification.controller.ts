import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { GamificationService } from './gamification.service';

@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  // GET /api/gamification/me -> { points, weeklyPoints, streakCount, streakFreezes }
  // The streak pill / leaderboard header read this instead of parsing the whole /users/me doc.
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getMySummary(user.userId);
  }
}
