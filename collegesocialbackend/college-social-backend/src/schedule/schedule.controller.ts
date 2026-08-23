import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ScheduleService } from './schedule.service';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { Department } from '../common/enums/department.enum';
import { AcademicYear } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';

// The official weekly timetable, published per department/academicYear/specialization by admins
// and professors. Reads are open to everyone (like the public lecture library).
@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // GET /api/schedule -> the caller's own class schedule, resolved from their profile
  // GET /api/schedule?department=&academicYear=&specialization= -> browse any group's schedule,
  // same "public, filterable by anyone" pattern as GET /posts/lectures.
  @Get()
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
  ) {
    if (department && academicYear && specialization) {
      return this.scheduleService.findForGroup({ department, academicYear, specialization });
    }
    return this.scheduleService.findForUser(user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleEntryDto) {
    return this.scheduleService.create(user.userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleEntryDto) {
    return this.scheduleService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.scheduleService.remove(id);
    return { success: true };
  }
}
