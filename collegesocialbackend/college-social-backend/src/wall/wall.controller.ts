import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { WallService } from './wall.service';
import { CreateWallPostDto } from './dto/create-wall-post.dto';

@UseGuards(JwtAuthGuard)
@Controller('wall')
export class WallController {
  constructor(private readonly wall: WallService) {}

  // GET /api/wall?page=1&limit=20&sort=new|top
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.wall.list(user, Number(page) || 1, Number(limit) || 20, sort === 'top' ? 'top' : 'new');
  }

  // One AI moderation call per post -- tighter than the global default.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWallPostDto) {
    return this.wall.create(user, dto.body);
  }

  @Post(':id/like')
  like(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.wall.toggleLike(user, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.wall.remove(user, id);
    return { success: true };
  }
}
