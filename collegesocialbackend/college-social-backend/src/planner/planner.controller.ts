import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PlannerService } from './planner.service';
import { CreatePlannerTaskDto } from './dto/create-planner-task.dto';
import { UpdatePlannerTaskDto } from './dto/update-planner-task.dto';

// A student's personal to-do list -- fully owner-scoped, no sharing between users.
@UseGuards(JwtAuthGuard)
@Controller('planner')
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get()
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.plannerService.findAllForOwner(user.userId);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePlannerTaskDto) {
    return this.plannerService.create(user.userId, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePlannerTaskDto) {
    return this.plannerService.update(id, user.userId, dto);
  }

  @Post(':id/toggle')
  async toggleDone(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plannerService.toggleDone(id, user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.plannerService.remove(id, user.userId);
    return { success: true };
  }
}
