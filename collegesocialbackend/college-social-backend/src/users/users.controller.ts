import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  // GET /api/users/me/friend-requests -- own pending requests only, not exposed for an arbitrary
  // id (see UsersService.listFriendRequests). "me/..." here doesn't collide with @Get(':id') below
  // (different segment count), so no ordering concern like leaderboard/suggestions have.
  @Get('me/friend-requests')
  async myFriendRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listFriendRequests(user.userId);
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

  // GET /api/users/suggestions -- same reason as leaderboard above: must stay above @Get(':id').
  @Get('suggestions')
  async suggestions(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.usersService.suggestFriends(user.userId, Number(limit) || 8);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post(':id/block')
  async block(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.blockUser(user.userId, id);
  }

  @Delete(':id/block')
  async unblock(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.unblockUser(user.userId, id);
  }

  @Post(':id/friend-request')
  async sendFriendRequest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.sendFriendRequest(user.userId, id);
  }

  @Post(':id/friend-accept')
  async acceptFriendRequest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.acceptFriendRequest(user.userId, id);
  }

  @Delete(':id/friend-request')
  async removeFriendRequest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.removeFriendRequest(user.userId, id);
  }

  @Delete(':id/friend')
  async unfriend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.unfriend(user.userId, id);
  }

  // GET /api/users/:id/friends -- public friends list for any user (own profile or someone
  // else's "Friends" tab); who's pending is private (see myFriendRequests above) but who's
  // already-friends isn't, same as this app already treats blockedUsers/etc.
  @Get(':id/friends')
  async userFriends(@Param('id') id: string) {
    return this.usersService.listFriends(id);
  }
}
