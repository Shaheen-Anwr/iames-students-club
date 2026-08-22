import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(user.userId, dto);
  }

  @Get()
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listMine(user.userId);
  }

  @Post('join')
  async join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinGroupDto) {
    return this.groupsService.joinByCode(user.userId, dto.code);
  }

  // Must be declared before GET /groups/:id -- otherwise ":id" would swallow "discover".
  @Get('discover')
  async discover(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.groupsService.discover(search, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.findOne(id, user.userId);
  }

  @Post(':id/join')
  async joinPublic(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.joinPublic(id, user.userId);
  }

  @Post(':id/leave')
  async leave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.groupsService.leave(id, user.userId);
    return { success: true };
  }

  @Post(':id/regenerate-code')
  async regenerateInviteCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.regenerateInviteCode(id, user.userId);
  }

  @Get(':id/channels')
  async listChannels(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listChannels(id, user.userId);
  }

  @Post(':id/channels')
  async createChannel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChannelDto) {
    return this.groupsService.createChannel(id, user.userId, dto);
  }

  @Get('channels/:channelId/messages')
  async getChannelMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.groupsService.getChannelMessages(channelId, user.userId, Number(page) || 1, Number(limit) || 30);
  }
}
