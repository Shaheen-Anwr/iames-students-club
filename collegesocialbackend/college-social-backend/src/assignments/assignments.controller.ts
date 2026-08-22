import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  // POST /api/assignments -- admin/professor only; students can no longer create assignments.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(user.userId, user.role, dto);
  }

  // GET /api/assignments?page=1&limit=20&courseCode=CS101&upcoming=true
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseCode') courseCode?: string,
    @Query('upcoming') upcoming?: string,
  ) {
    return this.assignmentsService.findAll(Number(page) || 1, Number(limit) || 20, courseCode, upcoming === 'true', user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.findOne(id, user.userId);
  }

  @Post(':id/complete')
  async toggleComplete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.toggleComplete(id, user.userId);
  }

  // DELETE /api/assignments/:id -- creator-only, no admin override, matching PostsService.remove()
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assignmentsService.remove(id, user.userId);
    return { success: true };
  }
}
