import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { QaService } from '../qa/qa.service';

// All routes here require a valid JWT AND the "admin" role.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/qa')
export class AdminQaController {
  constructor(private readonly qaService: QaService) {}

  // GET /api/admin/qa/questions?page=1&limit=20&search=cs101
  @Get('questions')
  async listQuestions(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.qaService.adminListQuestions(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/qa/questions/:id -- also removes its answers
  @Delete('questions/:id')
  @HttpCode(HttpStatus.OK)
  async removeQuestion(@Param('id') id: string) {
    await this.qaService.adminRemoveQuestion(id);
    return { success: true };
  }

  // DELETE /api/admin/qa/answers/:id
  @Delete('answers/:id')
  @HttpCode(HttpStatus.OK)
  async removeAnswer(@Param('id') id: string) {
    await this.qaService.adminRemoveAnswer(id);
    return { success: true };
  }
}
