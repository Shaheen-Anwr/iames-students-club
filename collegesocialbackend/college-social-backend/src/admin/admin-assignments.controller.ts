import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AssignmentsService } from '../assignments/assignments.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/assignments')
export class AdminAssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  // GET /api/admin/assignments?page=1&limit=20&search=cs101
  @Get()
  async listAssignments(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.assignmentsService.adminListAssignments(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/assignments/:id -- unlike remove(), not restricted to the creator
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.assignmentsService.adminRemove(id);
    return { success: true };
  }
}
