import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService, clampTrendRange } from './admin.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly adminService: AdminService) {}

  // GET /api/admin/stats -- unchanged aggregate snapshot (range-fixed 14d series).
  @Get()
  async getStats() {
    return this.adminService.getStats();
  }

  // GET /api/admin/stats/trends?range=7|14|30|90 -- period-over-period activity series + deltas
  // for the console dashboard. Additive; does not touch the payload of GET /api/admin/stats.
  @Get('trends')
  async getTrends(@Query('range') range?: string) {
    return this.adminService.getTrends(clampTrendRange(range));
  }
}
