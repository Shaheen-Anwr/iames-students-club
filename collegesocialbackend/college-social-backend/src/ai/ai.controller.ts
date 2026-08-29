import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AiConversationsService } from './ai-conversations.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiConversationsService: AiConversationsService) {}

  @Get('conversations')
  async listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.aiConversationsService.listMine(user.userId);
  }

  @Post('conversations')
  async createConversation(@CurrentUser() user: AuthenticatedUser) {
    return this.aiConversationsService.create(user.userId);
  }

  @Get('conversations/:id/messages')
  async getMessages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiConversationsService.getMessages(id, user.userId);
  }

  // Streams the assistant's reply as it's generated (text deltas, tool-call/tool-result events,
  // then a final 'done' with the saved message) as Server-Sent Events over this same POST route.
  // Native EventSource can't do POST + custom Authorization headers, so the frontend consumes this
  // with a manual fetch() + ReadableStream reader instead (see lib/api.ts's streamAiMessage).
  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendAiMessageDto,
    @Res() res: Response,
  ) {
    await this.streamSse(res, (signal) =>
      this.aiConversationsService.sendMessageStream(
        id,
        user.userId,
        user.department,
        dto.text,
        dto.attachment,
        dto.sharedPostId,
        signal,
      ),
    );
  }

  // Deletes the last assistant reply and re-answers the same question fresh. Same SSE contract as
  // sendMessage above, and does not count against the daily message quota (see
  // AiConversationsService.regenerateLastReply).
  @Post('conversations/:id/regenerate')
  async regenerate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    await this.streamSse(res, (signal) =>
      this.aiConversationsService.regenerateLastReply(id, user.userId, user.department, signal),
    );
  }

  // Shared SSE plumbing for both streaming routes above. Aborts the underlying generation as soon
  // as the client disconnects (stop-generation button, or the browser tab closing) via an
  // AbortSignal threaded down to the OpenAI call -- but keeps draining the generator afterwards
  // rather than breaking out of the loop: breaking early would call the generator's .return() and
  // skip its final `await message.save()`, losing whatever partial reply was already generated.
  // Draining is cheap once the signal fires, since the abort already cancels the expensive LLM call.
  private async streamSse(res: Response, run: (signal: AbortSignal) => AsyncGenerator<unknown>) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    let clientGone = false;
    res.on('close', () => {
      clientGone = true;
      controller.abort();
    });

    try {
      for await (const event of run(controller.signal)) {
        if (!clientGone) res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch {
      // Must never rethrow here -- headers are already sent, so letting this escape to the global
      // HttpExceptionFilter would crash on "headers already sent" instead of closing gracefully.
      if (!clientGone) res.write(`data: ${JSON.stringify({ type: 'error', message: 'حدث خطأ أثناء المحادثة' })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Delete('conversations/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.aiConversationsService.remove(id, user.userId);
    return { success: true };
  }
}
