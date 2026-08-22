import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { GamificationService } from '../gamification/gamification.service';
import { BadgeId } from '../gamification/badges';
import { AdminAdjustPointsDto } from './dto/admin-adjust-points.dto';
import { AdminGrantBadgeDto } from './dto/admin-grant-badge.dto';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/gamification')
export class AdminGamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  // GET /api/admin/gamification/leaderboard?limit=50
  @Get('leaderboard')
  async leaderboard(@Query('limit') limit?: string) {
    return this.gamificationService.getLeaderboard(Number(limit) || 50);
  }

  // PATCH /api/admin/gamification/:userId/points  { delta }
  @Patch(':userId/points')
  async adjustPoints(@Param('userId') userId: string, @Body() dto: AdminAdjustPointsDto) {
    return this.gamificationService.adminAdjustPoints(userId, dto.delta);
  }

  // POST /api/admin/gamification/:userId/badges  { badgeId }
  @Post(':userId/badges')
  async grantBadge(@Param('userId') userId: string, @Body() dto: AdminGrantBadgeDto) {
    return this.gamificationService.adminGrantBadge(userId, dto.badgeId);
  }

  // DELETE /api/admin/gamification/:userId/badges/:badgeId
  @Delete(':userId/badges/:badgeId')
  async revokeBadge(@Param('userId') userId: string, @Param('badgeId') badgeId: string) {
    return this.gamificationService.adminRevokeBadge(userId, badgeId as BadgeId);
  }
}
