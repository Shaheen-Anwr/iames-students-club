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
import { CreateScheduleBoardDto } from './dto/create-schedule-board.dto';
import { UpdateScheduleBoardDto } from './dto/update-schedule-board.dto';
import { Department } from '../common/enums/department.enum';
import { AcademicYear } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';

// The official weekly timetable, published per department/academicYear/specialization by admins
// and professors. A student/professor only ever sees their OWN group's schedule -- unlike the
// public lecture library, this is deliberately NOT browsable cross-group by a non-admin (a
// business-administration student must never be able to see engineering's or media science's
// timetable, even by hand-crafting the query string). Only ADMIN can pass the browse params below.
@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // GET /api/schedule -> the caller's own class schedule, resolved from their profile.
  // GET /api/schedule?department=&academicYear=&specialization= -> browse any group's schedule --
  // admin only. A student/professor passing these params has them silently ignored and falls back
  // to their own group, same "never trust a client-sent scope override" idiom as
  // PostsService.buildFeedFilter()'s DEPARTMENT branch, rather than erroring (a stray/copy-pasted
  // query string should just behave like it wasn't there, not surface a 403).
  @Get()
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
  ) {
    if (user.role === Role.ADMIN && department && academicYear && specialization) {
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

  // GET /api/schedule/board -> the caller's own group's whole-timetable photos (a group can have
  // several -- see ScheduleBoard's schema comment). `includeInactive=true` also returns ones an
  // admin has toggled off (see PATCH .../board/:id below) -- only the manage UI ever passes it.
  // GET /api/schedule/board?department=&academicYear=&specialization= -> browse any group's --
  // admin only, same cross-department privacy rule as GET /schedule above (silently ignored, not
  // rejected, for a non-admin).
  // NOTE: a literal 'board' segment is a different route shape than /schedule/:id (one more
  // segment), so this never collides with the entry routes below regardless of declaration order.
  @Get('board')
  async findBoards(
    @CurrentUser() user: AuthenticatedUser,
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const withInactive = includeInactive === 'true';
    if (user.role === Role.ADMIN && department && academicYear && specialization) {
      return this.scheduleService.getBoardsForGroup({ department, academicYear, specialization }, withInactive);
    }
    return this.scheduleService.getBoardsForUser(user.userId, withInactive);
  }

  // POST /api/schedule/board -> adds one more whole-timetable photo to a group, instead of
  // building it lecture-by-lecture via POST /schedule above. Always a new photo, never a replace
  // -- a group can hold any number (e.g. one per term).
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Post('board')
  async addBoard(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleBoardDto) {
    return this.scheduleService.addBoard(user, dto);
  }

  // PATCH /api/schedule/board/:id -> replace one photo's image/description in place, and/or flip
  // `active` (the show/hide toggle ScheduleBoardPhoto.tsx uses instead of a hard delete button).
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Patch('board/:id')
  async updateBoard(@Param('id') id: string, @Body() dto: UpdateScheduleBoardDto) {
    return this.scheduleService.updateBoard(id, dto);
  }

  // DELETE /api/schedule/board/:id -> permanently removes one photo. Not wired into the UI today
  // (which only exposes the active/inactive toggle above) -- kept for future cleanup tooling.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Delete('board/:id')
  async removeBoard(@Param('id') id: string) {
    await this.scheduleService.removeBoard(id);
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
