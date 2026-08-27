import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { MilitaryService } from './military.service';
import { UpsertMilitaryPeriodDto } from './dto/upsert-military-period.dto';
import { UpdateMilitarySettingsDto } from './dto/update-military-settings.dto';
import { CreateMilitaryTodoDto, UpdateMilitaryTodoDto } from './dto/military-todo.dto';

// التربية العسكرية (military education). The camp period + daily attendance streak + motivation,
// the student's own to-do list and daily time window, plus the admin CSV schedule upload.
// The course's broadcast assignments reuse the normal /assignments routes with isMilitary=true.
@UseGuards(JwtAuthGuard)
@Controller('military')
export class MilitaryController {
  constructor(private readonly militaryService: MilitaryService) {}

  // GET /api/military -> period + caller status + schedule + caller settings + caller to-dos.
  @Get()
  async overview(@CurrentUser() user: AuthenticatedUser) {
    return this.militaryService.getOverview(user.userId);
  }

  // POST /api/military/checkin -> log today's attendance, bump the streak.
  @Post('checkin')
  async checkIn(@CurrentUser() user: AuthenticatedUser) {
    return this.militaryService.checkIn(user.userId);
  }

  // PATCH /api/military/settings -> the student's own daily "from -> to" time window.
  @Patch('settings')
  async updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMilitarySettingsDto) {
    return this.militaryService.updateSettings(user.userId, dto);
  }

  // --- Student to-do list ---

  @Get('todos')
  async listTodos(@CurrentUser() user: AuthenticatedUser) {
    return this.militaryService.listTodos(user.userId);
  }

  @Post('todos')
  async addTodo(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMilitaryTodoDto) {
    return this.militaryService.addTodo(user.userId, dto);
  }

  @Patch('todos/:id')
  async updateTodo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMilitaryTodoDto,
  ) {
    return this.militaryService.updateTodo(user.userId, id, dto);
  }

  @Delete('todos/:id')
  async deleteTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.militaryService.deleteTodo(user.userId, id);
    return { success: true };
  }

  // --- Admin ---

  // PATCH /api/military/period -> admin sets/edits the from->to dates and motivational quotes.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('period')
  async upsertPeriod(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertMilitaryPeriodDto) {
    return this.militaryService.upsertPeriod(user.userId, dto);
  }

  // POST /api/military/schedule/upload -> admin uploads a CSV of dated sessions (field "file").
  // Columns: date,title,start,end,location (location optional; Arabic header aliases accepted).
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('schedule/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          /\.csv$/i.test(file.originalname) ||
          /(csv|excel|text\/plain|octet-stream)/i.test(file.mimetype);
        cb(ok ? null : new BadRequestException('ارفع ملف CSV فقط (يمكن حفظ ملف Excel بصيغة CSV)'), ok);
      },
    }),
  )
  async uploadSchedule(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.militaryService.replaceScheduleFromCsv(user.userId, file.buffer.toString('utf-8'));
  }

  // POST /api/military/roster/upload -> admin uploads the unit name list (CSV or PDF, field "file").
  // Each name is matched to a registered account; unmatched names come back in the response.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('roster/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          /\.(csv|pdf)$/i.test(file.originalname) ||
          /(csv|pdf|excel|text\/plain|octet-stream)/i.test(file.mimetype);
        cb(ok ? null : new BadRequestException('ارفع ملف CSV أو PDF فقط'), ok);
      },
    }),
  )
  async uploadRoster(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.militaryService.replaceRosterFromFile(user.userId, file);
  }

  // GET /api/military/roster -> per-student assignment progress + attendance, staff only.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.PROFESSOR)
  @Get('roster')
  async roster() {
    return this.militaryService.getRoster();
  }
}
