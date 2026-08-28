import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { StorageService } from '../upload/storage.service';
import { buildMulterOptions } from '../upload/multer.config';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly storageService: StorageService,
  ) {}

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

  // Also before GET /groups/:id. Every group in the app for the unified explorer list.
  @Get('all')
  async listAll(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) {
    return this.groupsService.listAll(user.userId, search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.findOne(id, user.userId);
  }

  // Owner-only: rename / re-describe / flip visibility (public<->private regenerates or drops the code).
  @Patch(':id')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, user.userId, dto);
  }

  // Owner-only: permanently delete the group + all its channels and messages.
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.groupsService.remove(id, user.userId);
    return { success: true };
  }

  // Owner-only: upload + set the group's avatar image.
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('group-photos')))
  async setPhoto(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    const { url } = await this.storageService.upload(file, 'group-photos');
    return this.groupsService.setPhoto(id, user.userId, url);
  }

  // Owner-only: clear the group's avatar image.
  @Delete(':id/photo')
  async removePhoto(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.removePhoto(id, user.userId);
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

  @Get(':id/members')
  async listMembers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listGroupMembers(id, user.userId);
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

  @Get('channels/:channelId/media')
  async getChannelMedia(@Param('channelId') channelId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.getChannelSharedMedia(channelId, user.userId);
  }

  @Post('channels/messages/:messageId/star')
  async starChannelMessage(@Param('messageId') messageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.starChannelMessage(messageId, user.userId);
  }

  @Delete('channels/messages/:messageId/star')
  async unstarChannelMessage(@Param('messageId') messageId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.unstarChannelMessage(messageId, user.userId);
  }
}
