import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ChatService } from './chat.service';
import { LinkPreviewService } from './link-preview.service';
import { UnsafeUrlError } from '../common/utils/url-safety.util';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AddMembersDto } from './dto/add-members.dto';
import { MuteConversationDto } from './dto/mute-conversation.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ForwardMessageDto } from './dto/forward-message.dto';

// REST endpoints for conversation setup, history, and everything that doesn't need to be
// instantaneous. Real-time delivery of new/edited/reacted messages happens over the ChatGateway
// (WebSocket) -- most of these also have a socket-event twin there for live updates, but are
// exposed here too so the UI (group settings, starred messages, search) works without relying on
// an open socket.
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly linkPreviewService: LinkPreviewService,
  ) {}

  @Get('link-preview')
  async getLinkPreview(@Query('url') url?: string) {
    if (!url) throw new BadRequestException('الرابط مطلوب');
    try {
      return await this.linkPreviewService.getPreview(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  @Get('conversations')
  async listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.listConversationsForUser(user.userId);
  }

  @Post('conversations')
  async createConversation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.chatService.createConversation(user.userId, dto);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(id, user.userId, Number(page) || 1, Number(limit) || 30);
  }

  @Get('conversations/:id/search')
  async searchMessages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Query('q') q: string) {
    return this.chatService.searchMessages(id, user.userId, q ?? '');
  }

  @Get('conversations/:id/media')
  async getSharedMedia(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getSharedMedia(id, user.userId);
  }

  @Patch('conversations/:id')
  async updateConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chatService.updateGroupInfo(id, user.userId, dto);
  }

  @Post('conversations/:id/members')
  async addMembers(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: AddMembersDto) {
    return this.chatService.addMembers(id, user.userId, dto.userIds);
  }

  @Delete('conversations/:id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.removeMember(id, user.userId, targetUserId);
  }

  @Post('conversations/:id/admins/:userId')
  async promoteAdmin(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.setAdmin(id, user.userId, targetUserId, true);
  }

  @Delete('conversations/:id/admins/:userId')
  async demoteAdmin(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.setAdmin(id, user.userId, targetUserId, false);
  }

  @Post('conversations/:id/leave')
  async leaveGroup(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.chatService.leaveGroup(id, user.userId);
    return { success: true };
  }

  @Post('conversations/:id/pin')
  async togglePin(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.togglePin(id, user.userId);
  }

  @Post('conversations/:id/archive')
  async toggleArchive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.toggleArchive(id, user.userId);
  }

  @Post('conversations/:id/mute')
  async mute(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: MuteConversationDto) {
    return this.chatService.muteConversation(id, user.userId, dto.minutes);
  }

  @Delete('conversations/:id/mute')
  async unmute(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.unmuteConversation(id, user.userId);
  }

  @Delete('conversations/:id/messages')
  async clearChat(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.chatService.clearChat(id, user.userId);
    return { success: true };
  }

  @Get('starred')
  async listStarred(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.listStarred(user.userId);
  }

  @Post('messages/:id/star')
  async starMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.starMessage(id, user.userId);
  }

  @Delete('messages/:id/star')
  async unstarMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.unstarMessage(id, user.userId);
  }

  @Patch('messages/:id')
  async editMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: EditMessageDto) {
    return this.chatService.editMessage(id, user.userId, dto.text);
  }

  @Delete('messages/:id')
  async deleteMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('forEveryone') forEveryone?: string,
  ) {
    return this.chatService.deleteMessage(id, user.userId, forEveryone === 'true');
  }

  @Post('messages/:id/forward')
  async forwardMessage(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ForwardMessageDto) {
    return this.chatService.forwardMessage(id, user.userId, dto.conversationIds);
  }
}
