import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { viewerScopeDepartment } from '../common/utils/viewer-scope.util';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateGroupAssignmentDto } from './dto/create-group-assignment.dto';

@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  // POST /api/assignments -- admin/professor only; students can no longer create assignments.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(user.userId, user.role, user.department, dto);
  }

  // GET /api/assignments?page=1&limit=20&courseCode=CS101&upcoming=true&military=true
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseCode') courseCode?: string,
    @Query('upcoming') upcoming?: string,
    @Query('military') military?: string,
  ) {
    return this.assignmentsService.findAll(
      Number(page) || 1,
      Number(limit) || 20,
      courseCode,
      upcoming === 'true',
      user.userId,
      military === 'true',
      viewerScopeDepartment(user),
    );
  }

  // POST /api/assignments/group/:groupId -- group-owner only, enforced inside the service via
  // GroupsService.assertOwner() (no @Roles guard here, unlike the global create route above).
  @Post('group/:groupId')
  async createGroupAssignment(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupAssignmentDto,
  ) {
    return this.assignmentsService.createForGroup(groupId, user.userId, dto);
  }

  // GET /api/assignments/group/:groupId -- any group member.
  @Get('group/:groupId')
  async findAllForGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assignmentsService.findAllForGroup(groupId, user.userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.findOne(id, user.userId);
  }

  // GET /api/assignments/:id/attachment -- streams the assignment's raw 'lecture'/'file' attachment,
  // reassembling it if it was too large for a single Cloudinary asset and got split on upload.
  // Frontend should always link/embed a document assignment attachment through this rather than its
  // raw attachmentUrl, mirroring PostsController's GET :id/attachment.
  @Get(':id/attachment')
  async streamAttachment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    await this.assignmentsService.streamAttachment(id, res, user.userId);
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
