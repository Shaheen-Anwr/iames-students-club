import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitQuizAttemptDto } from './dto/submit-quiz-attempt.dto';

@UseGuards(JwtAuthGuard)
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // POST /api/quizzes -- any authenticated user (students included), unlike Assignments which
  // is professor-only: quizzes are meant to be made by students, for students.
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuizDto) {
    return this.quizzesService.create(user.userId, dto);
  }

  // GET /api/quizzes?page=1&limit=20&courseCode=CS101
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseCode') courseCode?: string,
  ) {
    return this.quizzesService.findAll(Number(page) || 1, Number(limit) || 20, courseCode, user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.findOne(id, user.userId);
  }

  @Post(':id/attempt')
  async submitAttempt(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitQuizAttemptDto) {
    return this.quizzesService.submitAttempt(id, user.userId, dto);
  }

  // DELETE /api/quizzes/:id -- creator-only, no role restriction, matching PostsService.remove.
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.quizzesService.remove(id, user.userId);
    return { success: true };
  }
}
