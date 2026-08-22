import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Role } from '../common/enums/role.enum';
import { AnnouncementsService } from '../announcements/announcements.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  // GET /api/admin/announcements?page=1&limit=20&search=exam -- unlike list(), not department-filtered
  @Get()
  async listAnnouncements(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.announcementsService.adminList(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/announcements/:id -- remove() already permits ADMIN to delete any
  // announcement (see AnnouncementsService.remove), so this just calls it with the actor's role.
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.announcementsService.remove(id, actor.userId, actor.role);
    return { success: true };
  }
}
