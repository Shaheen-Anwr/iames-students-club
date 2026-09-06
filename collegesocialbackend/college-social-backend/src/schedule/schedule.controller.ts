import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ScheduleService } from './schedule.service';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { UpsertScheduleBoardDto } from './dto/upsert-schedule-board.dto';
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
    return this.scheduleService.create(user, dto);
  }

  // GET /api/schedule/board -> the caller's own group's whole-timetable photo (or null if none),
  // GET /api/schedule/board?department=&academicYear=&specialization= -> browse any group's.
  // NOTE: must stay above @Get(':id')-shaped routes -- there are none on this controller today,
  // but keep it that way if one is ever added (same reasoning as PostsController's /courses, /saved).
  @Get('board')
  async findBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
  ) {
    if (department && academicYear && specialization) {
      return this.scheduleService.getBoardForGroup({ department, academicYear, specialization });
    }
    return this.scheduleService.getBoardForUser(user.userId);
  }

  // POST /api/schedule/board -> upload/replace the whole-timetable photo for a group, instead of
  // building it lecture-by-lecture via POST /schedule above.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Post('board')
  async upsertBoard(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertScheduleBoardDto) {
    return this.scheduleService.upsertBoard(user, dto);
  }

  // DELETE /api/schedule/board?department=&academicYear=&specialization= -> removes a group's
  // photo. Must stay above @Delete(':id') below -- otherwise "board" would be swallowed as an id.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Delete('board')
  async removeBoard(
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
  ) {
    // Require all three explicitly -- an accidentally-omitted param must never fall through to a
    // Mongo filter with an undefined field, which would match (and delete) every group's photo.
    if (!department || !academicYear || !specialization) {
      throw new BadRequestException('حدد القسم والسنة الدراسية والتخصص');
    }
    await this.scheduleService.removeBoard({ department, academicYear, specialization });
    return { success: true };
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
