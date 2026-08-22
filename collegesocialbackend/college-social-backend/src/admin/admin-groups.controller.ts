import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { GroupsService } from '../groups/groups.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/groups')
export class AdminGroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // GET /api/admin/groups?page=1&limit=20&search=cs101
  @Get()
  async listGroups(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.groupsService.adminListGroups(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/groups/:id -- unlike normal deletion, not restricted to the owner
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.groupsService.adminRemoveGroup(id);
    return { success: true };
  }

  // DELETE /api/admin/groups/messages/:id
  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  async removeMessage(@Param('id') id: string) {
    await this.groupsService.adminRemoveChannelMessage(id);
    return { success: true };
  }
}
