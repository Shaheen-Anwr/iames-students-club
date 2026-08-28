import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdminService } from './admin.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';

// User-account management. Deliberately stricter than the other admin panels: these routes require
// a valid JWT AND the "super admin" flag (a strict subset of role: 'admin'). Regular admins get a
// 403 here but keep every other admin controller.
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // GET /api/admin/users?page=1&limit=20&search=jane&verified=false
  @Get()
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('verified') verified?: string,
  ) {
    const verifiedFilter = verified === undefined ? undefined : verified === 'true';
    return this.adminService.listUsers(Number(page) || 1, Number(limit) || 20, search, verifiedFilter);
  }

  // PATCH /api/admin/users/:id  { role?, isActive?, isSuperAdmin? }
  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    let user;
    if (dto.role !== undefined) {
      user = await this.adminService.updateRole(id, dto.role, actor);
    }
    if (dto.isActive !== undefined) {
      user = await this.adminService.updateActive(id, dto.isActive, actor);
    }
    if (dto.isSuperAdmin !== undefined) {
      user = await this.adminService.updateSuperAdmin(id, dto.isSuperAdmin, actor);
    }
    return user;
  }

  // PATCH /api/admin/users/:id/password  { password }
  @Patch(':id/password')
  async setPassword(@Param('id') id: string, @Body() dto: AdminSetPasswordDto) {
    const user = await this.adminService.setPassword(id, dto.password);
    return { success: true, userId: user.id };
  }

  // PATCH /api/admin/users/:id/verify-email -- marks the college email verified directly,
  // bypassing the normal send-a-code-to-their-inbox flow.
  @Patch(':id/verify-email')
  async verifyEmail(@Param('id') id: string) {
    return this.adminService.verifyEmail(id);
  }

  // DELETE /api/admin/users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.adminService.remove(id, actor);
    return { success: true };
  }
}
