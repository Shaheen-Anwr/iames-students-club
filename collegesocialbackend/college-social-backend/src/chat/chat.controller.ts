import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
import { ScheduleMessageDto } from './dto/schedule-message.dto';
import { ChatSchedulerService } from './chat-scheduler.service';
import { ChatCallService } from './chat-call.service';

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
    private readonly schedulerService: ChatSchedulerService,
    private readonly callService: ChatCallService,
  ) {}

  // STUN/TURN servers for a WebRTC call (TURN credentials are short-lived, minted per user).
  @Get('calls/ice-servers')
  async iceServers(@CurrentUser() user: AuthenticatedUser) {
    return this.callService.getIceServers(user.userId);
  }

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

  // Newest-first history. `before=<messageId>` pages backwards from a message (infinite scroll up);
  // `since=<ISO date>` returns everything from that instant to the cursor in one go (jumping to an
  // old search hit / pin / date), so it gets a higher cap than a normal page.
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : undefined;
    const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : undefined;
    const cap = validSince ? 1000 : 100;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), cap);
    const safePage = Math.max(Number(page) || 1, 1);
    return this.chatService.getMessages(id, user.userId, safePage, safeLimit, { beforeId: before, since: validSince });
  }

  // Search across all of this user's conversations (the chat list's search box).
  @Get('search')
  async searchAll(@CurrentUser() user: AuthenticatedUser, @Query('q') q?: string) {
    return this.chatService.searchAllMessages(user.userId, q ?? '');
  }

  @Get('conversations/:id/pins')
  async listPins(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.listPins(id, user.userId);
  }

  // --- Scheduled ("send later") messages ---

  @Get('conversations/:id/scheduled')
  async listScheduled(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulerService.listPending(user.userId, id);
  }

  @Post('conversations/:id/scheduled')
  async scheduleMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScheduleMessageDto,
  ) {
    return this.schedulerService.schedule(user.userId, id, dto);
  }

  @Delete('scheduled/:id')
  async cancelScheduled(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulerService.cancel(user.userId, id);
  }

  @Post('scheduled/:id/send-now')
  async sendScheduledNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.schedulerService.sendNow(user.userId, id);
  }

  // Sender-only per-recipient read / delivered breakdown (WhatsApp's "message info").
  @Get('messages/:id/info')
  async messageInfo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.getMessageInfo(id, user.userId);
  }

  // GET /api/chat/messages/:id/attachments/:index/download -- streams a message's document
  // attachment, reassembling it if it was too large for a single Cloudinary asset and got split on
  // upload. The frontend should always link/embed a chunked document attachment through this
  // instead of its raw url, mirroring PostsController's GET :id/attachment.
  @Get('messages/:id/attachments/:index/download')
  async downloadMessageAttachment(
    @Param('id') id: string,
    @Param('index') index: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.chatService.streamMessageAttachment(id, Number(index), res, user.userId);
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

  @Delete('conversations/:id')
  async deleteConversation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.chatService.deleteConversation(id, user.userId);
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
