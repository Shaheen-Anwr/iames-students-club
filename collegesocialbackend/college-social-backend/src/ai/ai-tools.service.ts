import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { PlannerService } from '../planner/planner.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ChatService } from '../chat/chat.service';
import { QaService } from '../qa/qa.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { FeedContextService } from './feed-context.service';
import { AiMemoryService } from './ai-memory.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { Department } from '../common/enums/department.enum';

export interface ToolExecutionContext {
  ownerId: string;
  ownerDepartment: Department | null;
}

export interface ToolExecutionResult {
  // JSON string fed back to the model as the tool result -- always a string, even for errors, so
  // execute() below never has to distinguish "the tool failed" from "the tool succeeded" at the
  // OpenAI-protocol level; the model just reads an { error: ... } payload like any other result.
  content: string;
  // Human-readable audit line, only set for tools that actually changed something -- surfaced to
  // the student as a receipt (see AiMessage.actions) and to AiConversationsService's stream as a
  // 'tool_result' event.
  actionSummary?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any, ctx: ToolExecutionContext) => Promise<ToolExecutionResult>;

function tool(name: string, description: string, parameters: Record<string, unknown>): OpenAI.Chat.ChatCompletionTool {
  return { type: 'function', function: { name, description, parameters } };
}

// Owns the tool schema list the model sees and executes whatever it calls, by delegating to the
// real feature services (Planner/Assignments/Chat/Qa/Groups/Feed/Memory) rather than duplicating
// their logic. Kept a sibling of AiService (a thin OpenAI-protocol wrapper) rather than folded
// into it, mirroring the existing split between AiService and AiConversationsService.
@Injectable()
export class AiToolsService {
  private readonly handlers: Record<string, ToolHandler>;

  constructor(
    private readonly plannerService: PlannerService,
    private readonly assignmentsService: AssignmentsService,
    private readonly chatService: ChatService,
    private readonly qaService: QaService,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
    private readonly feedContextService: FeedContextService,
    private readonly aiMemoryService: AiMemoryService,
    private readonly realtimeEmitterService: RealtimeEmitterService,
  ) {
    this.handlers = {
      list_planner_tasks: this.listPlannerTasks.bind(this),
      create_planner_task: this.createPlannerTask.bind(this),
      complete_planner_task: this.completePlannerTask.bind(this),
      remove_planner_task: this.removePlannerTask.bind(this),
      list_assignments: this.listAssignments.bind(this),
      complete_assignment: this.completeAssignment.bind(this),
      read_post_thread: this.readPostThread.bind(this),
      search_qa: this.searchQa.bind(this),
      search_groups: this.searchGroups.bind(this),
      send_chat_message: this.sendChatMessage.bind(this),
      remember_about_me: this.rememberAboutMe.bind(this),
      forget_my_memory: this.forgetMyMemory.bind(this),
    };
  }

  getToolDefinitions(): OpenAI.Chat.ChatCompletionTool[] {
    return [
      tool('list_planner_tasks', 'اعرض كل مهام الطالب في المخطط الشخصي (planner)، منجزة وغير منجزة.', {
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      tool('create_planner_task', 'أضف مهمة جديدة إلى مخطط الطالب الشخصي.', {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'عنوان المهمة' },
          notes: { type: 'string', description: 'ملاحظات إضافية اختيارية' },
          dueDate: { type: 'string', description: 'تاريخ الاستحقاق بصيغة ISO 8601، اختياري' },
          courseCode: { type: 'string', description: 'رمز المقرر المرتبط، اختياري' },
        },
        required: ['title'],
        additionalProperties: false,
      }),
      tool('complete_planner_task', 'علّم مهمة في المخطط الشخصي كمُنجَزة (لا يلغي الإنجاز إن كانت منجزة أصلاً).', {
        type: 'object',
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
        additionalProperties: false,
      }),
      tool('remove_planner_task', 'احذف مهمة من المخطط الشخصي نهائيًا.', {
        type: 'object',
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
        additionalProperties: false,
      }),
      tool('list_assignments', 'اعرض الواجبات المتاحة للطالب (العامة والخاصة به)، مع إمكانية التصفية.', {
        type: 'object',
        properties: {
          upcoming: { type: 'boolean', description: 'اعرض فقط الواجبات القادمة (لم يحن موعدها بعد)' },
          courseCode: { type: 'string', description: 'تصفية حسب رمز المقرر' },
        },
        additionalProperties: false,
      }),
      tool('complete_assignment', 'علّم واجبًا كمكتمل من قبل الطالب (لا يلغي الإكمال إن كان مكتملًا أصلاً).', {
        type: 'object',
        properties: { assignmentId: { type: 'string' } },
        required: ['assignmentId'],
        additionalProperties: false,
      }),
      tool('read_post_thread', 'اقرأ منشورًا معينًا على المنصة مع كل تعليقاته كاملة (وليس مقتطفات فقط).', {
        type: 'object',
        properties: { postId: { type: 'string' } },
        required: ['postId'],
        additionalProperties: false,
      }),
      tool('search_qa', 'ابحث في أسئلة وأجوبة الطلاب على المنصة.', {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      }),
      tool('search_groups', 'ابحث عن مجموعات دراسية عامة على المنصة بالاسم.', {
        type: 'object',
        properties: { query: { type: 'string', description: 'نص البحث، اختياري لعرض كل المجموعات العامة' } },
        additionalProperties: false,
      }),
      tool(
        'send_chat_message',
        'أرسل رسالة دردشة نيابة عن الطالب. استخدم conversationId لمحادثة موجودة، أو toUserName لبدء محادثة جديدة مع طالب آخر باسمه (الطريقة المفضلة -- لا تطلب من الطالب معرّفًا رقميًا)، ' +
          'أو toUserId إن كان معروفًا لديك بالفعل من سياق سابق. إذا رجعت الأداة خطأ يفيد بوجود أكثر من طالب بنفس الاسم مع قائمة مرشحين، اسأل الطالب أن يحدد باسمه الكامل أو معرفه الجامعي ثم أعد المحاولة.',
        {
          type: 'object',
          properties: {
            conversationId: { type: 'string' },
            toUserName: { type: 'string', description: 'اسم الطالب المستلم (كامل أو جزئي)، سيتم البحث عنه على المنصة' },
            toUserId: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      ),
      tool('remember_about_me', 'احفظ معلومة دائمة عن الطالب لتستخدمها في محادثات مستقبلية (مثل تخصصه أو سنته الدراسية).', {
        type: 'object',
        properties: { fact: { type: 'string' } },
        required: ['fact'],
        additionalProperties: false,
      }),
      tool('forget_my_memory', 'احذف كل المعلومات المحفوظة سابقًا عن الطالب.', {
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
    ];
  }

  // Never throws -- a bad tool call (unknown name, malformed args, a service exception) degrades
  // to the model reading an { error } payload and telling the student, not a dead SSE stream.
  async execute(name: string, argsJson: string, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const handler = this.handlers[name];
    if (!handler) return { content: JSON.stringify({ error: `أداة غير معروفة: ${name}` }) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: any = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      return { content: JSON.stringify({ error: 'تعذّر قراءة معطيات الأداة' }) };
    }

    try {
      return await handler(args, ctx);
    } catch (err) {
      return { content: JSON.stringify({ error: (err as Error).message || 'فشل تنفيذ الإجراء' }) };
    }
  }

  private async listPlannerTasks(_args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tasks = await this.plannerService.findAllForOwner(ctx.ownerId);
    return {
      content: JSON.stringify(tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate, courseCode: t.courseCode }))),
    };
  }

  private async createPlannerTask(
    args: { title: string; notes?: string; dueDate?: string; courseCode?: string },
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const task = await this.plannerService.create(ctx.ownerId, args);
    return { content: JSON.stringify({ id: task.id, title: task.title }), actionSummary: `✓ أضاف مهمة: ${task.title}` };
  }

  private async completePlannerTask(args: { taskId: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const task = await this.plannerService.setDone(args.taskId, ctx.ownerId, true);
    return { content: JSON.stringify({ id: task.id, done: task.done }), actionSummary: `✓ أنجز مهمة: ${task.title}` };
  }

  private async removePlannerTask(args: { taskId: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tasks = await this.plannerService.findAllForOwner(ctx.ownerId);
    const task = tasks.find((t) => t.id === args.taskId);
    await this.plannerService.remove(args.taskId, ctx.ownerId);
    return { content: JSON.stringify({ removed: true }), actionSummary: `✓ حذف مهمة: ${task?.title ?? args.taskId}` };
  }

  private async listAssignments(
    args: { upcoming?: boolean; courseCode?: string },
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const assignments = await this.assignmentsService.findAll(1, 20, args.courseCode, args.upcoming, ctx.ownerId);
    return {
      content: JSON.stringify(
        assignments.map((a) => ({
          id: a.id,
          title: a.title,
          courseCode: a.courseCode,
          dueDate: a.dueDate,
          completed: a.completedBy.some((c) => c.toString() === ctx.ownerId),
        })),
      ),
    };
  }

  private async completeAssignment(args: { assignmentId: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const assignment = await this.assignmentsService.findOne(args.assignmentId, ctx.ownerId);
    const alreadyDone = assignment.completedBy.some((c) => c.toString() === ctx.ownerId);
    if (!alreadyDone) {
      await this.assignmentsService.toggleComplete(args.assignmentId, ctx.ownerId);
    }
    return { content: JSON.stringify({ id: assignment.id, completed: true }), actionSummary: `✓ أكمل واجب: ${assignment.title}` };
  }

  private async readPostThread(args: { postId: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const thread = await this.feedContextService.getThread(args.postId, ctx.ownerDepartment);
    if (!thread) return { content: JSON.stringify({ error: 'المنشور غير موجود أو غير مسموح لك برؤيته' }) };
    return {
      content: JSON.stringify({
        caption: thread.post.caption,
        comments: thread.comments.map((c) => ({
          text: c.text,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          author: (c.author as any)?.name ?? null,
        })),
      }),
    };
  }

  private async searchQa(args: { query: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const results = await this.qaService.search(args.query, 5, ctx.ownerDepartment);
    return { content: JSON.stringify(results.map((q) => ({ id: q.id, title: q.title, body: q.body, answerCount: q.answerCount }))) };
  }

  private async searchGroups(args: { query?: string }): Promise<ToolExecutionResult> {
    const groups = await this.groupsService.discover(args.query, 1, 10);
    return { content: JSON.stringify(groups.map((g) => ({ id: g.id, name: g.name, description: g.description, visibility: g.visibility }))) };
  }

  // Resolves a name/collegeId query to exactly one user id, or reports why it couldn't: no match,
  // or an ambiguous multi-match (the model is expected to ask the student to narrow it down and
  // retry, rather than guessing and messaging the wrong person).
  private async resolveUserByName(
    query: string,
    excludeUserId: string,
  ): Promise<{ id: string | null; candidates: { id: string; name: string; collegeId: string }[] }> {
    const results = await this.usersService.search(query);
    const candidates = results.filter((u) => u.id !== excludeUserId);
    if (candidates.length === 0) return { id: null, candidates: [] };

    // An exact (case-insensitive) full-name match wins outright even if the regex search also
    // returned other partial matches -- e.g. searching "Ahmed" among "Ahmed Samir" and "Ahmed"
    // should resolve to the literal "Ahmed" without asking the student to disambiguate.
    const normalized = query.trim().toLowerCase();
    const exact = candidates.filter((u) => u.name.trim().toLowerCase() === normalized);
    if (exact.length === 1) return { id: exact[0].id, candidates: [] };

    if (candidates.length === 1) return { id: candidates[0].id, candidates: [] };

    return { id: null, candidates: candidates.slice(0, 5).map((u) => ({ id: u.id, name: u.name, collegeId: u.collegeId })) };
  }

  private async sendChatMessage(
    args: { conversationId?: string; toUserId?: string; toUserName?: string; text: string },
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (!args.conversationId && !args.toUserId && !args.toUserName) {
      return { content: JSON.stringify({ error: 'يجب تحديد conversationId أو toUserName' }) };
    }

    let conversationId = args.conversationId;
    if (!conversationId) {
      let recipientId = args.toUserId;
      if (!recipientId && args.toUserName) {
        const resolved = await this.resolveUserByName(args.toUserName, ctx.ownerId);
        if (!resolved.id) {
          return {
            content: JSON.stringify(
              resolved.candidates.length > 0
                ? { error: 'يوجد أكثر من طالب بهذا الاسم، اطلب من الطالب اسمًا أكمل أو معرفًا جامعيًا للتحديد', candidates: resolved.candidates }
                : { error: `لم يتم العثور على طالب باسم "${args.toUserName}"` },
            ),
          };
        }
        recipientId = resolved.id;
      }
      if (!recipientId) return { content: JSON.stringify({ error: 'تعذّر تحديد المستلم' }) };

      const conversation = await this.chatService.createConversation(ctx.ownerId, { participantIds: [recipientId] });
      conversationId = conversation.id;
    }

    const message = await this.chatService.saveMessage(conversationId!, ctx.ownerId, args.text, undefined, undefined);
    // saveMessage doesn't return the conversation itself -- fetched separately to know who else
    // to push the realtime event to (see ChatGateway.onSendMessage, which this mirrors).
    const conversation = await this.chatService.assertParticipant(conversationId!, ctx.ownerId);
    for (const participant of conversation.participants) {
      this.realtimeEmitterService.emitToUser(participant.toString(), 'newMessage', message);
    }

    return { content: JSON.stringify({ sent: true, conversationId }), actionSummary: '✓ أرسل رسالة دردشة' };
  }

  private async rememberAboutMe(args: { fact: string }, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.aiMemoryService.remember(ctx.ownerId, args.fact);
    return { content: JSON.stringify({ saved: true }), actionSummary: '✓ حفظ معلومة عنك' };
  }

  private async forgetMyMemory(_args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.aiMemoryService.forgetAll(ctx.ownerId);
    return { content: JSON.stringify({ cleared: true }), actionSummary: '✓ حذف كل ما حفظه عنك' };
  }
}
