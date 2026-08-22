import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ChatService } from '../chat/chat.service';

// All routes here require a valid JWT AND the "admin" role. Deliberately metadata-only --
// see ChatService's admin section for why this never exposes full private message content.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/chat')
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /api/admin/chat/conversations?page=1&limit=20&search=cs101
  @Get('conversations')
  async listConversations(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.chatService.adminListConversations(Number(page) || 1, Number(limit) || 20, search);
  }

  // DELETE /api/admin/chat/conversations/:id -- also removes its messages
  @Delete('conversations/:id')
  @HttpCode(HttpStatus.OK)
  async removeConversation(@Param('id') id: string) {
    await this.chatService.adminRemoveConversation(id);
    return { success: true };
  }

  // DELETE /api/admin/chat/messages/:id -- moderation-by-ID, e.g. after an off-platform report
  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  async removeMessage(@Param('id') id: string) {
    await this.chatService.adminRemoveMessage(id);
    return { success: true };
  }
}
