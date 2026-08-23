import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { QaService } from './qa.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { CreateGroupQuestionDto } from './dto/create-group-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { QuestionScope } from './schemas/question.schema';

@UseGuards(JwtAuthGuard)
@Controller('qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post()
  async askQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskQuestionDto) {
    return this.qaService.askQuestion(user.userId, user.department, dto);
  }

  // GET /api/qa?page=1&limit=20&courseCode=CS101&scope=public|department
  @Get()
  async listQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseCode') courseCode?: string,
    @Query('scope') scope?: QuestionScope,
  ) {
    return this.qaService.listQuestions(Number(page) || 1, Number(limit) || 20, courseCode, scope, user.department);
  }

  // POST /api/qa/group/:groupId -- group-owner only, enforced via GroupsService.assertOwner().
  @Post('group/:groupId')
  async createGroupQuestion(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupQuestionDto,
  ) {
    return this.qaService.createForGroup(groupId, user.userId, dto);
  }

  // GET /api/qa/group/:groupId -- any group member.
  @Get('group/:groupId')
  async listQuestionsForGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.qaService.listQuestionsForGroup(groupId, user.userId, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qaService.findOne(id, user.userId);
  }

  @Get(':id/answers')
  async listAnswers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qaService.listAnswers(id, user.userId);
  }

  @Post(':id/answers')
  async answer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAnswerDto) {
    return this.qaService.answer(id, user.userId, dto.body);
  }

  @Post('answers/:answerId/upvote')
  async toggleUpvote(@Param('answerId') answerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qaService.toggleUpvote(answerId, user.userId);
  }

  // Question-author-only, enforced in QaService.acceptAnswer.
  @Post('answers/:answerId/accept')
  async acceptAnswer(@Param('answerId') answerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.qaService.acceptAnswer(answerId, user.userId);
  }
}
