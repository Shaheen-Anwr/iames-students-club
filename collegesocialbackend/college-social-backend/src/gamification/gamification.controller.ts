import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { GamificationService } from './gamification.service';

@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  // GET /api/gamification/me -> { points, weeklyPoints, streakCount, streakFreezes, lastFreezeUsedAt }
  // The streak pill / leaderboard header read this instead of parsing the whole /users/me doc.
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getMySummary(user.userId);
  }

  // GET /api/gamification/recap -> last week's activity summary (home "أسبوعك" card).
  @Get('recap')
  async recap(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getWeeklyRecap(user.userId, 1);
  }

  // GET /api/gamification/friend-activity -> recent posts/quizzes/assignments by the caller's friends.
  @Get('friend-activity')
  async friendActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.getFriendActivity(user.userId, 15);
  }
}
