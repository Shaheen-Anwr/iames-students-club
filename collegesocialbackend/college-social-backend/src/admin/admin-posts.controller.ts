import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/posts')
export class AdminPostsController {
  constructor(private readonly adminService: AdminService) {}

  // GET /api/admin/posts?page=1&limit=20&search=exam
  @Get()
  async listPosts(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.adminService.listPosts(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/posts/:id -- unlike PostsController.remove(), not restricted to the author
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.adminService.removePost(id);
    return { success: true };
  }
}
