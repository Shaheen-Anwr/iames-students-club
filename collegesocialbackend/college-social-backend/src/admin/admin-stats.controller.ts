import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly adminService: AdminService) {}

  // GET /api/admin/stats
  @Get()
  async getStats() {
    return this.adminService.getStats();
  }
}
