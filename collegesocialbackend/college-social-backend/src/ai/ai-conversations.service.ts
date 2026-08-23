import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { AiConversation, AiConversationDocument } from './schemas/ai-conversation.schema';
import { AiMessage, AiMessageDocument, AiMessageSource } from './schemas/ai-message.schema';
import { AiService, SYSTEM_PROMPT } from './ai.service';
import { AiToolsService, ToolExecutionContext } from './ai-tools.service';
import { AiMemoryService } from './ai-memory.service';
import { LectureSearchService } from './lecture-search.service';
import { LectureIndexService } from './lecture-index.service';
import { FeedContextService } from './feed-context.service';
import { ScheduleContextService } from './schedule-context.service';
import { StorageService } from '../upload/storage.service';
import { Department } from '../common/enums/department.enum';
import { DailyCount, daysAgoStart, fillDailyCounts } from '../common/utils/daily-counts.util';

const TITLE_MAX_LENGTH = 60;
const MAX_TOOL_ROUNDS = 4;

export interface AiConversationStats {
  totalConversations: number;
  totalMessages: number;
  dailyMessages: DailyCount[];
}

export interface AiMessageAttachmentInput {
  url: string;
  type: 'image' | 'document';
  mimeType?: string;
}

// Events streamed to the controller (and from there, over SSE, to the frontend) as one AI turn is
// produced -- see AiController.sendMessage and lib/api.ts's streamAiMessage on the frontend.
export type AiStreamEvent =
  | { type: 'delta'; text: string; stub?: boolean }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; summary: string }
  | { type: 'done'; message: AiMessageDocument }
  | { type: 'error'; message: string };

// Wraps third-party, student-authored content (feed posts/comments, lecture excerpts, a read
// post's comment thread) so the model treats it as reference data, never as instructions --
// mitigates a comment being crafted to manipulate the assistant into misusing an action tool.
function wrapUntrusted(label: string, text: string): string {
  return `[بيانات غير موثوقة]\n${label}:\n${text}\n[/بيانات غير موثوقة]`;
}

@Injectable()
export class AiConversationsService {
  private readonly visionModel: string;
  private readonly dailyMessageQuota: number;

  constructor(
    @InjectModel(AiConversation.name) private conversationModel: Model<AiConversationDocument>,
    @InjectModel(AiMessage.name) private messageModel: Model<AiMessageDocument>,
    private readonly aiService: AiService,
    private readonly aiToolsService: AiToolsService,
    private readonly aiMemoryService: AiMemoryService,
    private readonly lectureSearchService: LectureSearchService,
    private readonly lectureIndexService: LectureIndexService,
    private readonly feedContextService: FeedContextService,
    private readonly scheduleContextService: ScheduleContextService,
    private readonly storageService: StorageService,
    config: ConfigService,
  ) {
    this.visionModel = config.get<string>('ai.visionModel') ?? '';
    this.dailyMessageQuota = config.get<number>('ai.dailyMessageQuota') ?? 40;
  }

  // Counts this student's 'user' messages sent since local midnight, across all their
  // conversations -- see AiMessage.owner and its compound index.
  private async countMessagesToday(ownerId: string): Promise<number> {
    return this.messageModel
      .countDocuments({ owner: new Types.ObjectId(ownerId), role: 'user', createdAt: { $gte: daysAgoStart(1) } })
      .exec();
  }

  async listMine(ownerId: string): Promise<AiConversationDocument[]> {
    return this.conversationModel.find({ owner: new Types.ObjectId(ownerId) }).sort({ updatedAt: -1 }).exec();
  }

  private async findOwned(id: string, ownerId: string): Promise<AiConversationDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المحادثة غير موجودة');
    const conversation = await this.conversationModel.findOne({ _id: id, owner: new Types.ObjectId(ownerId) }).exec();
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    return conversation;
  }

  async create(ownerId: string): Promise<AiConversationDocument> {
    return new this.conversationModel({ owner: new Types.ObjectId(ownerId) }).save();
  }

  async getMessages(conversationId: string, ownerId: string): Promise<AiMessageDocument[]> {
    await this.findOwned(conversationId, ownerId);
    return this.messageModel.find({ conversation: new Types.ObjectId(conversationId) }).sort({ createdAt: 1 }).exec();
  }

  // Saves the student's message, gathers relevant context (lecture PDFs, feed posts/comments,
  // schedule, remembered facts, an attachment), then runs a streaming tool-calling loop: the
  // model may call platform tools (AiToolsService) across up to MAX_TOOL_ROUNDS rounds before
  // producing its final answer. Every text delta and tool call/result is yielded immediately for
  // the controller to relay over SSE; the final assistant AiMessage (with sources + an actions
  // audit trail) is saved and yielded once as the last 'done' event.
  async *sendMessageStream(
    conversationId: string,
    ownerId: string,
    ownerDepartment: Department | null,
    text: string,
    attachment?: AiMessageAttachmentInput,
    sharedPostId?: string,
  ): AsyncGenerator<AiStreamEvent> {
    const conversation = await this.findOwned(conversationId, ownerId);

    const usedToday = await this.countMessagesToday(ownerId);
    if (usedToday >= this.dailyMessageQuota) {
      yield {
        type: 'error',
        message: `لقد استنفدت الحد الأقصى لعدد الرسائل اليومية مع المساعد الذكي (${this.dailyMessageQuota} رسالة). حاول مرة أخرى غدًا.`,
      };
      return;
    }

    await new this.messageModel({
      conversation: conversation._id,
      owner: conversation.owner,
      role: 'user',
      text,
      attachmentUrl: attachment?.url,
      attachmentType: attachment?.type,
      sharedPostId,
    }).save();

    if (!conversation.title) {
      conversation.title = text.slice(0, TITLE_MAX_LENGTH);
    }

    const history = await this.messageModel.find({ conversation: conversation._id }).sort({ createdAt: 1 }).exec();

    const [lectureChunks, posts, comments, scheduleBlock, memoryFacts, sharedThread] = await Promise.all([
      this.lectureSearchService.search(text, ownerDepartment),
      this.feedContextService.searchPosts(text, ownerDepartment),
      this.feedContextService.searchComments(text, ownerDepartment),
      this.scheduleContextService.describeSchedule(ownerId),
      this.aiMemoryService.listForOwner(ownerId),
      sharedPostId ? this.feedContextService.getThread(sharedPostId, ownerDepartment) : Promise.resolve(null),
    ]);

    const sources: AiMessageSource[] = [];
    const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (scheduleBlock) {
      openAiMessages.push({ role: 'system', content: `جدول الطالب الدراسي:\n${scheduleBlock}` });
      sources.push({ label: 'جدولك' });
    }
    if (memoryFacts.length) {
      openAiMessages.push({
        role: 'system',
        content: `معلومات سبق أن ذكرها الطالب لك:\n${memoryFacts.map((f) => `- ${f.fact}`).join('\n')}`,
      });
    }
    if (sharedPostId) {
      if (sharedThread) {
        const commentsText = sharedThread.comments.map((c) => `- ${c.text}`).join('\n') || '(لا توجد تعليقات)';
        openAiMessages.push({
          role: 'system',
          content: wrapUntrusted('منشور شاركه الطالب معك في هذه الرسالة', `${sharedThread.post.caption}\n\nالتعليقات:\n${commentsText}`),
        });
        sources.push({ label: 'منشور مشارك', ref: sharedPostId });
      } else {
        openAiMessages.push({
          role: 'system',
          content: 'حاول الطالب مشاركة منشور معك لكنه غير موجود أو غير مسموح لك برؤيته -- أخبره بذلك بإيجاز.',
        });
      }
    }
    for (const chunk of lectureChunks) {
      openAiMessages.push({ role: 'system', content: wrapUntrusted('مقتطف من محاضرة', chunk.text) });
      sources.push({ label: 'محاضرة', ref: chunk.id });
    }
    for (const post of posts) {
      openAiMessages.push({ role: 'system', content: wrapUntrusted('منشور من طالب على المنصة', post.caption) });
      sources.push({ label: 'منشور طالب', ref: post.id });
    }
    for (const comment of comments) {
      openAiMessages.push({ role: 'system', content: wrapUntrusted('تعليق من طالب على المنصة', comment.text) });
      sources.push({ label: 'تعليق طالب', ref: comment.id });
    }

    for (const m of history) {
      openAiMessages.push({ role: m.role, content: m.text });
    }

    await this.applyAttachment(openAiMessages, attachment);

    const tools = this.aiToolsService.getToolDefinitions();
    const toolCtx: ToolExecutionContext = { ownerId, ownerDepartment };
    let replyText = '';
    let usedStub = false;
    const actions: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let roundText = '';
      let toolCalls: { id: string; name: string; argsJson: string }[] = [];
      const offerTools = round < MAX_TOOL_ROUNDS - 1;
      const modelForRound = attachment?.type === 'image' && this.visionModel ? this.visionModel : undefined;

      for await (const chunk of this.aiService.streamCompletion(openAiMessages, offerTools ? tools : [], modelForRound)) {
        if (chunk.type === 'text') {
          roundText += chunk.delta;
          replyText += chunk.delta;
          if (chunk.stub) usedStub = true;
          yield { type: 'delta', text: chunk.delta, stub: chunk.stub };
        } else {
          toolCalls = chunk.calls;
        }
      }

      if (toolCalls.length === 0) break;

      const assistantMsg: OpenAI.Chat.ChatCompletionMessageParam = {
        role: 'assistant',
        content: roundText || null,
        tool_calls: toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.argsJson },
        })),
      };
      openAiMessages.push(assistantMsg);

      for (const call of toolCalls) {
        let parsedArgs: unknown = {};
        try {
          parsedArgs = call.argsJson ? JSON.parse(call.argsJson) : {};
        } catch {
          // leave {} -- AiToolsService.execute will re-parse and report the same error to the model
        }
        yield { type: 'tool_call', name: call.name, args: parsedArgs };

        const result = await this.aiToolsService.execute(call.name, call.argsJson, toolCtx);
        if (result.actionSummary) actions.push(result.actionSummary);

        const toolMsg: OpenAI.Chat.ChatCompletionMessageParam = { role: 'tool', tool_call_id: call.id, content: result.content };
        openAiMessages.push(toolMsg);
        yield { type: 'tool_result', name: call.name, summary: result.actionSummary ?? 'تم' };
      }
    }

    const reply = await new this.messageModel({
      conversation: conversation._id,
      owner: conversation.owner,
      role: 'assistant',
      text: replyText,
      sources,
      actions,
      stub: usedStub,
    }).save();
    await conversation.save();

    yield { type: 'done', message: reply };
  }

  // Folds an attachment into the prompt: a document gets its text extracted (reusing
  // LectureIndexService's PDF extraction) and injected as untrusted context; an image is only
  // sent as a vision content part if AI_VISION_MODEL is configured, otherwise the student is told
  // vision isn't set up yet instead of silently sending an image to a text-only model.
  private async applyAttachment(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    attachment?: AiMessageAttachmentInput,
  ): Promise<void> {
    if (!attachment) return;

    if (attachment.type === 'document') {
      const extracted = attachment.url.toLowerCase().endsWith('.pdf') ? await this.lectureIndexService.extractPdfText(attachment.url) : null;
      messages.push({
        role: 'system',
        content: extracted
          ? wrapUntrusted('محتوى ملف أرفقه الطالب', extracted.slice(0, 4000))
          : 'أرفق الطالب ملفًا لم يتمكن النظام من قراءة محتواه (نوع الملف غير مدعوم حاليًا أو تعذّر جلبه) -- أخبر الطالب بذلك بإيجاز.',
      });
      return;
    }

    if (attachment.type === 'image') {
      if (!this.visionModel) {
        messages.push({ role: 'system', content: 'أرفق الطالب صورة، لكن ميزة تحليل الصور غير مُفعّلة على هذا الخادم بعد -- أخبره بذلك بإيجاز.' });
        return;
      }
      const buffer = await this.storageService.getObject(attachment.url);
      if (!buffer) {
        messages.push({ role: 'system', content: 'أرفق الطالب صورة لكن تعذّر جلبها -- أخبره بذلك بإيجاز.' });
        return;
      }
      const base64 = buffer.toString('base64');
      const mime = attachment.mimeType || 'image/png';
      // Replace the just-pushed plain-text version of the current user message with a multi-part
      // version carrying the image -- it's guaranteed to be the last message pushed (the loop
      // over `history` above always ends with the message just saved for this turn).
      const lastIndex = messages.length - 1;
      const last = messages[lastIndex];
      if (last?.role === 'user' && typeof last.content === 'string') {
        messages[lastIndex] = {
          role: 'user',
          content: [
            { type: 'text', text: last.content },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        };
      }
    }
  }

  async remove(conversationId: string, ownerId: string): Promise<void> {
    const conversation = await this.findOwned(conversationId, ownerId);
    await this.messageModel.deleteMany({ conversation: conversation._id }).exec();
    await this.conversationModel.findByIdAndDelete(conversation._id).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // Analytics only -- no content browsing, students' AI chats stay private.

  async getStats(): Promise<AiConversationStats> {
    const [totalConversations, totalMessages, dailyMessages] = await Promise.all([
      this.conversationModel.countDocuments().exec(),
      this.messageModel.countDocuments().exec(),
      this.dailyMessages(14),
    ]);
    return { totalConversations, totalMessages, dailyMessages };
  }

  private async dailyMessages(days: number): Promise<DailyCount[]> {
    const rows = await this.messageModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: daysAgoStart(days) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ])
      .exec();
    return fillDailyCounts(rows, days);
  }
}
