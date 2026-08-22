import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { GamificationService } from '../gamification/gamification.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly gamificationService: GamificationService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.userId, dto);
  }

  @Get('search')
  async search(@Query('q') q: string) {
    return this.usersService.search(q ?? '');
  }

  // GET /api/users/leaderboard -- NOTE: must stay above @Get(':id') or it gets swallowed as an id lookup.
  @Get('leaderboard')
  async leaderboard(@Query('limit') limit?: string) {
    return this.gamificationService.getLeaderboard(Number(limit) || 20);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
