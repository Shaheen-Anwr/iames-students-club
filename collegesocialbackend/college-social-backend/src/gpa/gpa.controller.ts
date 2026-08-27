import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { GpaService } from './gpa.service';
import { CreateGpaCourseDto } from './dto/create-gpa-course.dto';
import { UpdateGpaCourseDto } from './dto/update-gpa-course.dto';

// A student's personal GPA calculator -- fully owner-scoped, no sharing between users.
@UseGuards(JwtAuthGuard)
@Controller('gpa')
export class GpaController {
  constructor(private readonly gpaService: GpaService) {}

  // GET /api/gpa -> every course the caller has added + the computed cumulative/per-term summary.
  @Get()
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    const [courses, summary] = await Promise.all([
      this.gpaService.findAllForOwner(user.userId),
      this.gpaService.getSummaryForOwner(user.userId),
    ]);
    return { courses, summary };
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGpaCourseDto) {
    return this.gpaService.create(user.userId, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateGpaCourseDto) {
    return this.gpaService.update(id, user.userId, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.gpaService.remove(id, user.userId);
    return { success: true };
  }
}
