import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@UseGuards(JwtAuthGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  // POST /api/announcements -- professors and admins only
  @UseGuards(RolesGuard)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(user.userId, user.department, dto);
  }

  // GET /api/announcements?page=1&limit=20
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.announcementsService.list(Number(page) || 1, Number(limit) || 20, user.department);
  }

  // DELETE /api/announcements/:id -- author or admin
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.announcementsService.remove(id, user.userId, user.role);
    return { success: true };
  }
}
