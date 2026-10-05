import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Response } from 'express';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AttachmentDto } from './dto/create-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DailyCount,
  daysAgoStart,
  fillDailyCounts,
  previousWindowMatch,
  TrendSeries,
} from '../common/utils/daily-counts.util';
import { extractMentionIds } from '../common/utils/tag-parser.util';
import { UsersService } from '../users/users.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { StorageService } from '../upload/storage.service';
import {
  escapeRegex,
  FORWARD_LIMITS,
  isMessageEffect,
  MAX_PINNED_MESSAGES,
  messagePreviewText,
  normalizePollInput,
} from './chat.constants';

export interface PaginatedConversations {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}

export interface ChatStats {
  totalConversations: number;
  groupConversations: number;
  totalMessages: number;
  dailyMessages: DailyCount[];
}

// Optional extras for a send, beyond text/attachments/reply (see CreateMessageDto).
export interface SaveMessageExtras {
  poll?: unknown;
  effect?: string | null;
  silent?: boolean;
}

export interface PinnedMessageView {
  message: MessageDocument;
  pinnedBy: string;
  pinnedAt: Date;
}

// The sender's "message info" breakdown: who read it (and when), who only received it, who hasn't
// yet. `at` is null for receipts recorded before per-recipient timestamps existed.
export interface MessageInfo {
  messageId: string;
  read: { user: string; at: Date | null }[];
  delivered: { user: string; at: Date | null }[];
  pending: string[];
}

// One message flattened for an AI prompt (catch-up summary, smart replies).
export interface AiTranscriptMessage {
  id: string;
  senderId: string | null;
  senderName: string;
  text: string;
  poll: { question: string; options: string[] } | null;
  attachmentTypes: string[];
  createdAt: Date;
}

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name role photoUrl collegeId' },
  { path: 'reactions.user', select: 'name' },
  {
    path: 'replyTo',
    select: 'text sender attachments deletedForEveryone poll',
    populate: { path: 'sender', select: 'name' },
  },
];

const PARTICIPANT_FIELDS = 'name role photoUrl collegeId isOnline lastSeenAt';

// Notifications for one new message are written this many recipients at a time -- bounded
// concurrency, so a 300-member public group doesn't fire 300 simultaneous DB writes + pushes.
const NOTIFY_BATCH = 15;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly storageService: StorageService,
  ) {}

  async createConversation(creatorId: string, dto: CreateConversationDto): Promise<ConversationDocument> {
    const participantIds = Array.from(new Set([creatorId, ...dto.participantIds]));
    const visibility = dto.visibility === 'public' ? 'public' : 'private';
    // A public conversation is always a group -- it makes no sense as a 1-to-1 DM.
    const isGroup = visibility === 'public' ? true : (dto.isGroup ?? false);

    if (isGroup && !dto.name?.trim()) {
      throw new BadRequestException('اسم المجموعة مطلوب');
    }
    if (!isGroup && participantIds.length < 2) {
      throw new BadRequestException('يجب تحديد مستخدم واحد على الأقل');
    }

    // For 1-to-1 chats, reuse an existing conversation instead of creating duplicates
    if (!isGroup && participantIds.length === 2) {
      const [a, b] = participantIds;
      if (await this.usersService.areBlocked(a, b)) {
        throw new ForbiddenException('لا يمكن بدء محادثة مع هذا المستخدم');
      }
      // $all/$size on an array path isn't reliably cast by Mongoose the way plain equality
      // is -- passing raw ID strings here silently matches nothing even when a conversation
      // already exists, so every repeat "مراسلة" click spawned a brand-new duplicate chat
      // instead of reusing the old one. Casting explicitly sidesteps that.
      // Older duplicate conversations from before this fix may still exist for some pairs --
      // sort so the one actually in use (most recent message, else most recently created)
      // wins over a stray empty duplicate.
      const existing = await this.conversationModel
        .findOne({
          isGroup: false,
          participants: { $all: participantIds.map((id) => new Types.ObjectId(id)), $size: 2 },
        })
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .populate('participants', PARTICIPANT_FIELDS)
        .exec();
      if (existing) return existing;
    }

    const conversation = new this.conversationModel({
      participants: participantIds.map((id) => new Types.ObjectId(id)),
      isGroup,
      visibility,
      name: dto.name ?? null,
      createdBy: new Types.ObjectId(creatorId),
      admins: isGroup ? [new Types.ObjectId(creatorId)] : [],
    });
    await conversation.save();
    // The frontend expects populated User objects in `participants`, same as
    // listConversationsForUser() -- without this, callers get raw ObjectIds instead.
    await conversation.populate('participants', PARTICIPANT_FIELDS);

    // A public group belongs in every user's chat list -- tell the online ones straight away
    // instead of waiting for their next list refresh / socket reconnect.
    if (visibility === 'public') {
      this.realtimeEmitter.broadcast('conversationCreated', conversation.toJSON());
    }
    return conversation;
  }

  async listConversationsForUser(userId: string): Promise<(ConversationDocument & { unreadCount: number })[]> {
    const uid = new Types.ObjectId(userId);
    const conversations = await this.conversationModel
      .find({
        $or: [
          { participants: uid, deletedBy: { $ne: uid } },
          // Public groups show for everyone, member or not -- unless an admin removed them.
          { visibility: 'public', blockedUsers: { $ne: uid } },
        ],
      })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate('participants', PARTICIPANT_FIELDS)
      .populate('lastMessageSender', 'name')
      .exec();

    // Only surface unread badges for conversations the user has actually joined -- otherwise
    // every public group they've never opened would scream its entire backlog at them.
    const joinedIds = conversations
      .filter((c) => c.participants.some((p) => (p as { _id?: Types.ObjectId } | null)?._id?.toString() === userId))
      .map((c) => c._id);

    const unreadCounts = await this.messageModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            conversation: { $in: joinedIds },
            sender: { $ne: uid },
            readBy: { $ne: uid },
            deletedFor: { $ne: uid },
          },
        },
        { $group: { _id: '$conversation', count: { $sum: 1 } } },
      ])
      .exec();
    const unreadMap = new Map(unreadCounts.map((u) => [u._id.toString(), u.count]));

    return conversations.map((c) =>
      Object.assign(c, { unreadCount: unreadMap.get((c._id as Types.ObjectId).toString()) ?? 0 }),
    );
  }

  // Lightweight variant of listConversationsForUser used by ChatGateway on every socket
  // connect/disconnect: it only needs the conversation IDs to join/emit to `conversation:<id>`
  // rooms, so it skips the participant populate + the unread-count aggregation entirely. Those
  // two extra round-trips per connection are what fall over during a reconnect storm.
  async listConversationIdsForUser(userId: string): Promise<string[]> {
    const uid = new Types.ObjectId(userId);
    const rows = await this.conversationModel
      .find({ participants: uid, deletedBy: { $ne: uid } })
      .select('_id')
      .lean()
      .exec();
    return rows.map((r) => (r._id as Types.ObjectId).toString());
  }

  // Public group IDs the user is allowed to see (member or not), minus any they've been
  // removed from. Used by ChatGateway to join their socket to those rooms on connect.
  async listPublicGroupIds(userId: string): Promise<string[]> {
    const uid = new Types.ObjectId(userId);
    const rows = await this.conversationModel
      .find({ visibility: 'public', blockedUsers: { $ne: uid } })
      .select('_id')
      .lean()
      .exec();
    return rows.map((r) => (r._id as Types.ObjectId).toString());
  }

  async assertParticipant(conversationId: string, userId: string): Promise<ConversationDocument> {
    if (!Types.ObjectId.isValid(conversationId)) throw new NotFoundException('المحادثة غير موجودة');
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('أنت لست جزءًا من هذه المحادثة');
    return conversation;
  }

  // Like assertParticipant, but a public group is reachable by any user who hasn't been
  // removed from it. Opening or interacting with one auto-joins the user (that's the implicit
  // "join" -- it also bounds message notification fan-out to people who've actually engaged).
  async assertCanAccessConversation(
    conversationId: string,
    userId: string,
    { autoJoin = true }: { autoJoin?: boolean } = {},
  ): Promise<ConversationDocument> {
    if (!Types.ObjectId.isValid(conversationId)) throw new NotFoundException('المحادثة غير موجودة');
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    if (conversation.participants.some((p) => p.toString() === userId)) return conversation;

    const isJoinablePublic =
      conversation.visibility === 'public' && !conversation.blockedUsers.some((b) => b.toString() === userId);
    if (!isJoinablePublic) throw new ForbiddenException('أنت لست جزءًا من هذه المحادثة');

    if (autoJoin) {
      conversation.participants.push(new Types.ObjectId(userId));
      await conversation.save();
    }
    return conversation;
  }

  async assertGroupAdmin(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertParticipant(conversationId, userId);
    if (!conversation.isGroup) throw new ForbiddenException('هذا الإجراء متاح للمجموعات فقط');
    if (!conversation.admins.some((a) => a.toString() === userId)) {
      throw new ForbiddenException('هذا الإجراء متاح لمشرفي المجموعة فقط');
    }
    return conversation;
  }

  // Lazily purges messages past a conversation's disappearing-messages window. Called whenever
  // the conversation is touched (opened or messaged) rather than on a cron, to avoid needing a
  // scheduler dependency for what's a best-effort cleanup, not a hard privacy guarantee.
  private async purgeExpiredMessages(conversation: ConversationDocument): Promise<void> {
    if (!conversation.disappearingSeconds) return;
    const cutoff = new Date(Date.now() - conversation.disappearingSeconds * 1000);
    await this.messageModel.deleteMany({ conversation: conversation._id, createdAt: { $lt: cutoff } }).exec();
  }

  private clearedAtFor(conversation: ConversationDocument, userId: string): Date | null {
    return conversation.clearedBy.find((c) => c.user.toString() === userId)?.at ?? null;
  }

  /**
   * Newest-first page of a conversation's messages for this user.
   *
   * Cursoring: `beforeId` returns the page strictly older than that message (stable while new
   * messages keep arriving, unlike `page`'s skip). `since` returns everything from that instant
   * up to the cursor -- used to jump to an old message (search hit, pin, date) in one request.
   */
  async getMessages(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 30,
    cursor: { beforeId?: string; since?: Date } = {},
  ): Promise<MessageDocument[]> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId);
    await this.purgeExpiredMessages(conversation);

    const filter: Record<string, unknown> = {
      conversation: conversation._id,
      deletedFor: { $ne: new Types.ObjectId(userId) },
    };
    const createdAt: Record<string, Date> = {};
    const clearedAt = this.clearedAtFor(conversation, userId);
    if (clearedAt) createdAt.$gt = clearedAt;
    if (cursor.since) createdAt.$gte = cursor.since;
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    let skip = (page - 1) * limit;
    if (cursor.beforeId && Types.ObjectId.isValid(cursor.beforeId)) {
      const pivot = await this.messageModel
        .findOne({ _id: cursor.beforeId, conversation: conversation._id })
        .select('createdAt')
        .lean<{ _id: Types.ObjectId; createdAt: Date } | null>()
        .exec();
      if (pivot) {
        // Strictly older than the pivot -- the _id tiebreak keeps two messages stamped in the
        // same millisecond from being skipped or repeated across pages.
        filter.$or = [
          { createdAt: { $lt: pivot.createdAt } },
          { createdAt: pivot.createdAt, _id: { $lt: pivot._id } },
        ];
        skip = 0;
      }
    }

    return this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate(MESSAGE_POPULATE)
      .exec();
  }

  async saveMessage(
    conversationId: string,
    senderId: string,
    text: string,
    attachments: AttachmentDto[] | undefined,
    replyTo: string | undefined,
    extras: SaveMessageExtras = {},
  ): Promise<MessageDocument> {
    const conversation = await this.assertCanAccessConversation(conversationId, senderId);
    const pollInput = extras.poll ? normalizePollInput(extras.poll) : null;
    if (extras.poll && !pollInput) {
      throw new BadRequestException('الاستطلاع يحتاج إلى سؤال وخيارين مختلفين على الأقل');
    }
    if (!text?.trim() && !attachments?.length && !pollInput) {
      throw new BadRequestException('لا يمكن إرسال رسالة فارغة');
    }

    if (!conversation.isGroup) {
      const other = conversation.participants.find((p) => p.toString() !== senderId);
      if (other && (await this.usersService.areBlocked(senderId, other.toString()))) {
        throw new ForbiddenException('لا يمكنك إرسال رسالة إلى هذا المستخدم');
      }
    }

    // A reply may only quote a message from this same conversation -- the populated `replyTo`
    // preview would otherwise leak another chat's text to everyone in this one.
    let replyToId: Types.ObjectId | null = null;
    if (replyTo && Types.ObjectId.isValid(replyTo)) {
      const quoted = await this.messageModel.exists({ _id: replyTo, conversation: conversation._id }).exec();
      if (quoted) replyToId = new Types.ObjectId(replyTo);
    }

    // A mention only counts if that user is actually a participant of this conversation --
    // otherwise it's a stale/tampered token and gets silently dropped, same as an invalid user id.
    const participantIds = new Set(conversation.participants.map((p) => p.toString()));
    const candidateMentionIds = extractMentionIds(text ?? '').filter(
      (id) => id !== senderId && participantIds.has(id),
    );
    const validMentionIds = await this.usersService.findExistingIds(candidateMentionIds);
    const mentions = validMentionIds.map((id) => new Types.ObjectId(id));

    const poll = pollInput
      ? {
          question: pollInput.question,
          multiple: pollInput.multiple,
          closed: false,
          options: pollInput.options.map((option, i) => ({ id: `o${i + 1}`, text: option, voters: [] })),
        }
      : null;

    const message = await new this.messageModel({
      conversation: new Types.ObjectId(conversationId),
      sender: new Types.ObjectId(senderId),
      text: text ?? '',
      attachments: attachments ?? [],
      replyTo: replyToId,
      readBy: [new Types.ObjectId(senderId)],
      deliveredTo: [new Types.ObjectId(senderId)],
      mentions,
      poll,
      effect: isMessageEffect(extras.effect) ? extras.effect : null,
    }).save();

    const previewText = messagePreviewText({ text, attachments, poll });
    // A new message "revives" the conversation for anyone who had deleted it -- same behavior
    // as most chat apps, where deleting only hides it until the next incoming message.
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        $set: {
          lastMessagePreview: previewText,
          lastMessageAt: new Date(),
          lastMessageId: message._id,
          lastMessageSender: new Types.ObjectId(senderId),
        },
        $pull: { deletedBy: { $in: conversation.participants } },
      })
      .exec();

    // "Send without sound" skips notifications entirely -- the message still lands, unread badge
    // and all; nobody's phone buzzes.
    if (!extras.silent) {
      this.notifyParticipants(conversation, senderId, previewText, new Set(validMentionIds));
    }

    return message.populate(MESSAGE_POPULATE);
  }

  // Writes the per-recipient notifications for a new message in the background: the message is
  // already saved and about to be broadcast, so a slow fan-out (big group, push latency) must
  // never hold up its delivery. Recipients who muted this conversation are skipped -- unless they
  // were @mentioned, which still gets through a mute (WhatsApp does the same).
  private notifyParticipants(
    conversation: ConversationDocument,
    senderId: string,
    previewText: string,
    mentionedIds: Set<string>,
  ): void {
    const now = Date.now();
    const mutedIds = new Set(
      (conversation.mutedBy ?? [])
        .filter((m) => !m.until || new Date(m.until).getTime() > now)
        .map((m) => m.user.toString()),
    );
    const recipients = conversation.participants
      .map((p) => p.toString())
      .filter((id) => id !== senderId && (mentionedIds.has(id) || !mutedIds.has(id)));
    if (!recipients.length) return;

    const conversationId = String(conversation._id);
    void (async () => {
      for (let i = 0; i < recipients.length; i += NOTIFY_BATCH) {
        // A specifically @mentioned participant gets the more specific 'mention' notification
        // instead of the generic 'chat_message' one, so nobody gets pinged twice for one message.
        await Promise.allSettled(
          recipients.slice(i, i + NOTIFY_BATCH).map((recipientId) =>
            this.notificationsService.create({
              recipient: recipientId,
              actor: senderId,
              type: mentionedIds.has(recipientId) ? 'mention' : 'chat_message',
              conversationId,
              preview: previewText,
            }),
          ),
        );
      }
    })().catch((err) => this.logger.warn(`Chat notification fan-out failed: ${(err as Error).message}`));
  }

  private async getOwnMessage(messageId: string, userId: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    if (message.sender.toString() !== userId) throw new ForbiddenException('لا يمكنك تعديل رسالة مستخدم آخر');
    return message;
  }

  async editMessage(messageId: string, userId: string, text: string): Promise<MessageDocument> {
    const message = await this.getOwnMessage(messageId, userId);
    if (message.deletedForEveryone) throw new BadRequestException('تم حذف هذه الرسالة');
    if (message.poll) throw new BadRequestException('لا يمكن تعديل الاستطلاع بعد إرساله');
    if (!text?.trim()) throw new BadRequestException('لا يمكن أن تكون الرسالة فارغة');
    message.text = text;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  // Streams one attachment of a message, reassembling it if it was too large for a single
  // Cloudinary asset and got split on upload (see StorageService.upload()'s chunked path) --
  // mirrors PostsService.streamAttachment(). Any participant of the conversation may open it, same
  // as they can already see the message itself.
  async streamMessageAttachment(messageId: string, index: number, res: Response, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('المرفق غير موجود');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('المرفق غير موجود');
    await this.assertCanAccessConversation(message.conversation.toString(), userId);

    const attachment = message.attachments?.[index];
    if (!attachment) throw new NotFoundException('المرفق غير موجود');

    await this.storageService.streamRawAttachment(res, {
      url: attachment.url,
      chunkCount: attachment.chunkCount ?? 1,
      originalName: attachment.name,
    });
  }

  async deleteMessage(messageId: string, userId: string, forEveryone: boolean): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    const conversation = await this.assertCanAccessConversation(message.conversation.toString(), userId);

    if (forEveryone) {
      if (message.sender.toString() !== userId) {
        throw new ForbiddenException('لا يمكنك حذف رسالة مستخدم آخر لدى الجميع');
      }
      message.deletedForEveryone = true;
      message.text = '';
      message.attachments = [];
      message.reactions = [];
      message.poll = null;
      message.effect = null;
      await message.save();

      // If this was the message the conversation list's cached preview was derived from, that
      // preview is now stale (it would otherwise keep leaking the deleted content) -- recompute it.
      if (conversation.lastMessageId?.toString() === messageId) {
        await this.refreshLastMessagePreview(String(conversation._id));
      }
      // A deleted message can't stay pinned to the top of the thread.
      if (conversation.pinnedMessages?.some((p) => p.message.toString() === messageId)) {
        await this.conversationModel
          .updateOne({ _id: conversation._id }, { $pull: { pinnedMessages: { message: message._id } } })
          .exec();
      }
    } else {
      const uid = new Types.ObjectId(userId);
      if (!message.deletedFor.some((d) => d.toString() === userId)) message.deletedFor.push(uid);
      await message.save();
    }
    return message.populate(MESSAGE_POPULATE);
  }

  // Recomputes a conversation's cached last-message preview from the most recent
  // not-deleted-for-everyone message, or clears it if none remain.
  private async refreshLastMessagePreview(conversationId: string): Promise<void> {
    const latest = await this.messageModel
      .findOne({ conversation: new Types.ObjectId(conversationId), deletedForEveryone: false })
      .sort({ createdAt: -1 })
      .select('text attachments poll sender createdAt')
      .lean<{
        _id: Types.ObjectId;
        text: string;
        attachments: AttachmentDto[];
        poll: { question: string } | null;
        sender: Types.ObjectId;
        createdAt: Date;
      } | null>()
      .exec();
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        $set: {
          lastMessageId: latest?._id ?? null,
          lastMessagePreview: latest ? messagePreviewText(latest) : null,
          lastMessageAt: latest?.createdAt ?? null,
          lastMessageSender: latest?.sender ?? null,
        },
      })
      .exec();
  }

  async reactToMessage(messageId: string, userId: string, emoji: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertCanAccessConversation(message.conversation.toString(), userId);

    const existingIndex = message.reactions.findIndex((r) => r.user.toString() === userId);
    if (existingIndex >= 0 && message.reactions[existingIndex].emoji === emoji) {
      // Tapping the same emoji again removes it, matching WhatsApp's toggle behavior.
      message.reactions.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      message.reactions[existingIndex].emoji = emoji;
    } else {
      message.reactions.push({ user: new Types.ObjectId(userId), emoji });
    }
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  // Single-message forward -- kept for the existing REST route / socket event.
  async forwardMessage(messageId: string, userId: string, conversationIds: string[]): Promise<MessageDocument[]> {
    return this.forwardMessages([messageId], userId, conversationIds);
  }

  // Forwards one or more messages (multi-select) into one or more conversations, preserving the
  // originals' order. Only text/attachments/poll questions are copied (a forwarded poll starts
  // with zero votes); the copies are flagged `forwarded` with no live link back. Every target is
  // validated up front, so a blocked or inaccessible target fails the whole request before
  // anything is sent rather than half-way through.
  async forwardMessages(messageIds: string[], userId: string, conversationIds: string[]): Promise<MessageDocument[]> {
    const ids = [...new Set(messageIds ?? [])]
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, FORWARD_LIMITS.maxMessages);
    const targetIds = [...new Set(conversationIds ?? [])]
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, FORWARD_LIMITS.maxConversations);
    if (!ids.length || !targetIds.length) throw new BadRequestException('اختر رسالة ومحادثة لإعادة التوجيه');

    const originals = await this.messageModel
      .find({ _id: { $in: ids }, deletedForEveryone: false, deletedFor: { $ne: new Types.ObjectId(userId) } })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (!originals.length) throw new BadRequestException('تم حذف هذه الرسالة');
    for (const sourceId of new Set(originals.map((m) => m.conversation.toString()))) {
      await this.assertCanAccessConversation(sourceId, userId);
    }

    const targets: ConversationDocument[] = [];
    for (const conversationId of targetIds) {
      const conversation = await this.assertCanAccessConversation(conversationId, userId);
      if (!conversation.isGroup) {
        const other = conversation.participants.find((p) => p.toString() !== userId);
        if (other && (await this.usersService.areBlocked(userId, other.toString()))) {
          throw new ForbiddenException('لا يمكنك إرسال رسالة إلى هذا المستخدم');
        }
      }
      targets.push(conversation);
    }

    const uid = new Types.ObjectId(userId);
    const results: MessageDocument[] = [];
    for (const conversation of targets) {
      let last: MessageDocument | null = null;
      for (const original of originals) {
        const message = await new this.messageModel({
          conversation: conversation._id,
          sender: uid,
          text: original.text,
          attachments: original.attachments,
          poll: original.poll
            ? {
                question: original.poll.question,
                multiple: original.poll.multiple,
                closed: false,
                options: original.poll.options.map((o) => ({ id: o.id, text: o.text, voters: [] })),
              }
            : null,
          forwarded: true,
          readBy: [uid],
          deliveredTo: [uid],
        }).save();
        results.push(await message.populate(MESSAGE_POPULATE));
        last = message;
      }
      if (!last) continue;

      const previewText = messagePreviewText(last);
      await this.conversationModel
        .findByIdAndUpdate(conversation._id, {
          $set: {
            lastMessagePreview: previewText,
            lastMessageAt: new Date(),
            lastMessageId: last._id,
            lastMessageSender: uid,
          },
          $pull: { deletedBy: { $in: conversation.participants } },
        })
        .exec();
      // One notification per target conversation, not one per forwarded message.
      this.notifyParticipants(conversation, userId, previewText, new Set());
    }
    return results;
  }

  async markDelivered(conversationId: string, userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(conversationId)) return [];
    const uid = new Types.ObjectId(userId);
    const conversationOid = new Types.ObjectId(conversationId);
    // Only a member's device can acknowledge delivery.
    if (!(await this.conversationModel.exists({ _id: conversationOid, participants: uid }).exec())) return [];

    const undelivered = await this.messageModel
      .find({ conversation: conversationOid, sender: { $ne: uid }, deliveredTo: { $ne: uid } })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    if (!undelivered.length) return [];
    const ids = undelivered.map((m) => m._id);
    // The `deliveredTo: {$ne}` guard makes the receipt push idempotent per document even if two
    // tabs acknowledge at the same moment.
    await this.messageModel
      .updateMany(
        { _id: { $in: ids }, deliveredTo: { $ne: uid } },
        { $addToSet: { deliveredTo: uid }, $push: { deliveryReceipts: { user: uid, at: new Date() } } },
      )
      .exec();
    return ids.map(String);
  }

  async markRead(conversationId: string, userId: string): Promise<string[]> {
    await this.assertCanAccessConversation(conversationId, userId);
    const uid = new Types.ObjectId(userId);
    const unread = await this.messageModel
      .find({ conversation: new Types.ObjectId(conversationId), sender: { $ne: uid }, readBy: { $ne: uid } })
      .select('_id deliveredTo')
      .lean<{ _id: Types.ObjectId; deliveredTo?: Types.ObjectId[] }[]>()
      .exec();
    if (!unread.length) return [];

    const now = new Date();
    const ids = unread.map((m) => m._id);
    const undeliveredIds = unread.filter((m) => !m.deliveredTo?.some((d) => d.equals(uid))).map((m) => m._id);
    await Promise.all([
      this.messageModel
        .updateMany(
          { _id: { $in: ids }, readBy: { $ne: uid } },
          { $addToSet: { readBy: uid }, $push: { readReceipts: { user: uid, at: now } } },
        )
        .exec(),
      // Read implies delivered: anything read before its delivery ack gets both stamps at once.
      undeliveredIds.length
        ? this.messageModel
            .updateMany(
              { _id: { $in: undeliveredIds }, deliveredTo: { $ne: uid } },
              { $addToSet: { deliveredTo: uid }, $push: { deliveryReceipts: { user: uid, at: now } } },
            )
            .exec()
        : Promise.resolve(null),
    ]);
    return ids.map(String);
  }

  // The sender's per-recipient breakdown (WhatsApp "message info"). Sender-only: other members
  // don't get to audit who read someone else's message.
  async getMessageInfo(messageId: string, userId: string): Promise<MessageInfo> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).select('+readReceipts +deliveryReceipts').exec();
    if (!message || message.deletedForEveryone) throw new NotFoundException('الرسالة غير موجودة');
    if (message.sender.toString() !== userId) {
      throw new ForbiddenException('معلومات القراءة متاحة لمرسل الرسالة فقط');
    }
    const conversation = await this.assertCanAccessConversation(message.conversation.toString(), userId, {
      autoJoin: false,
    });

    const readAt = new Map((message.readReceipts ?? []).map((r) => [r.user.toString(), r.at]));
    const deliveredAt = new Map((message.deliveryReceipts ?? []).map((r) => [r.user.toString(), r.at]));
    const readSet = new Set(message.readBy.map(String));
    const deliveredSet = new Set(message.deliveredTo.map(String));

    const info: MessageInfo = { messageId, read: [], delivered: [], pending: [] };
    for (const participant of conversation.participants) {
      const id = participant.toString();
      if (id === userId) continue;
      if (readSet.has(id)) info.read.push({ user: id, at: readAt.get(id) ?? null });
      else if (deliveredSet.has(id)) info.delivered.push({ user: id, at: deliveredAt.get(id) ?? null });
      else info.pending.push(id);
    }
    const newestFirst = (a: { at: Date | null }, b: { at: Date | null }) =>
      (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0);
    info.read.sort(newestFirst);
    info.delivered.sort(newestFirst);
    return info;
  }

  // --- Pinned messages (shared by every participant) ---

  async listPins(conversationId: string, userId: string): Promise<PinnedMessageView[]> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    return this.buildPins(conversation);
  }

  // Pins/unpins a message for everyone in its conversation. Any member may pin in a DM or private
  // group; in a public group only admins can, so a stranger can't hijack the top of the thread.
  async setMessagePinned(
    messageId: string,
    userId: string,
    pin: boolean,
  ): Promise<{ conversationId: string; pins: PinnedMessageView[] }> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).select('conversation deletedForEveryone').exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    const conversation = await this.assertParticipant(message.conversation.toString(), userId);
    if (
      conversation.isGroup &&
      conversation.visibility === 'public' &&
      !conversation.admins.some((a) => a.toString() === userId)
    ) {
      throw new ForbiddenException('تثبيت الرسائل في المجموعات العامة متاح للمشرفين فقط');
    }

    const alreadyPinned = conversation.pinnedMessages.some((p) => p.message.toString() === messageId);
    if (pin && !alreadyPinned) {
      if (message.deletedForEveryone) throw new BadRequestException('لا يمكن تثبيت رسالة محذوفة');
      conversation.pinnedMessages.push({
        message: message._id,
        pinnedBy: new Types.ObjectId(userId),
        pinnedAt: new Date(),
      });
      while (conversation.pinnedMessages.length > MAX_PINNED_MESSAGES) conversation.pinnedMessages.shift();
      await conversation.save();
    } else if (!pin && alreadyPinned) {
      conversation.pinnedMessages = conversation.pinnedMessages.filter((p) => p.message.toString() !== messageId);
      await conversation.save();
    }
    return { conversationId: String(conversation._id), pins: await this.buildPins(conversation) };
  }

  // Newest pin first, each with its fully populated message. Pins whose message has since been
  // deleted for everyone (or hard-deleted by moderation) are skipped.
  private async buildPins(conversation: ConversationDocument): Promise<PinnedMessageView[]> {
    const entries = conversation.pinnedMessages ?? [];
    if (!entries.length) return [];
    const messages = await this.messageModel
      .find({ _id: { $in: entries.map((p) => p.message) }, deletedForEveryone: false })
      .populate(MESSAGE_POPULATE)
      .exec();
    const byId = new Map(messages.map((m) => [String(m._id), m]));
    const views: PinnedMessageView[] = [];
    for (const entry of entries) {
      const message = byId.get(entry.message.toString());
      if (message) views.push({ message, pinnedBy: entry.pinnedBy.toString(), pinnedAt: entry.pinnedAt });
    }
    return views.reverse();
  }

  // --- Polls ---

  // Records this user's choice(s), replacing any earlier vote; an empty selection retracts it.
  // One aggregation-pipeline update = one atomic write per document, so two people voting at
  // the same instant can't overwrite each other (a find-modify-save here would lose votes).
  async votePoll(messageId: string, userId: string, optionIds: unknown): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).select('conversation poll deletedForEveryone').exec();
    if (!message || message.deletedForEveryone) throw new NotFoundException('الرسالة غير موجودة');
    if (!message.poll) throw new BadRequestException('هذه الرسالة ليست استطلاعًا');
    if (message.poll.closed) throw new BadRequestException('تم إغلاق هذا الاستطلاع');
    await this.assertCanAccessConversation(message.conversation.toString(), userId);

    const validIds = new Set(message.poll.options.map((o) => o.id));
    let chosen = Array.isArray(optionIds)
      ? [...new Set(optionIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)))]
      : [];
    if (!message.poll.multiple) chosen = chosen.slice(0, 1);

    const uid = new Types.ObjectId(userId);
    const votersWithoutMe = { $filter: { input: '$$o.voters', as: 'v', cond: { $ne: ['$$v', uid] } } };
    const result = await this.messageModel
      .updateOne({ _id: message._id, 'poll.closed': false }, [
        {
          $set: {
            'poll.options': {
              $map: {
                input: '$poll.options',
                as: 'o',
                in: {
                  $mergeObjects: [
                    '$$o',
                    {
                      voters: {
                        $cond: [
                          { $in: ['$$o.id', chosen] },
                          { $concatArrays: [votersWithoutMe, [uid]] },
                          votersWithoutMe,
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ])
      .exec();
    if (!result.matchedCount) throw new BadRequestException('تم إغلاق هذا الاستطلاع');
    return this.findPopulated(messageId);
  }

  // Only the poll's creator can end it; results stay visible, voting stops.
  async closePoll(messageId: string, userId: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const result = await this.messageModel
      .updateOne(
        { _id: messageId, sender: new Types.ObjectId(userId), poll: { $ne: null }, deletedForEveryone: false },
        { $set: { 'poll.closed': true } },
      )
      .exec();
    if (!result.matchedCount) throw new ForbiddenException('يمكن لمنشئ الاستطلاع فقط إنهاؤه');
    return this.findPopulated(messageId);
  }

  private async findPopulated(messageId: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).populate(MESSAGE_POPULATE).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    return message;
  }

  async starMessage(messageId: string, userId: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertCanAccessConversation(message.conversation.toString(), userId);
    const uid = new Types.ObjectId(userId);
    if (!message.starredBy.some((s) => s.toString() === userId)) message.starredBy.push(uid);
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  async unstarMessage(messageId: string, userId: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertCanAccessConversation(message.conversation.toString(), userId);
    message.starredBy = message.starredBy.filter((s) => s.toString() !== userId) as unknown as Types.ObjectId[];
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  async listStarred(userId: string): Promise<MessageDocument[]> {
    return this.messageModel
      .find({ starredBy: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate(MESSAGE_POPULATE)
      .exec();
  }

  // In-conversation search. The query is matched as plain text (regex-escaped -- user input must
  // never be compiled as a pattern) against message text and poll questions, and respects this
  // user's "clear chat" cutoff.
  async searchMessages(conversationId: string, userId: string, query: string): Promise<MessageDocument[]> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId);
    const q = query?.trim().slice(0, 100);
    if (!q) return [];
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    const filter: Record<string, unknown> = {
      conversation: conversation._id,
      deletedFor: { $ne: new Types.ObjectId(userId) },
      deletedForEveryone: false,
      $or: [{ text: pattern }, { 'poll.question': pattern }],
    };
    const clearedAt = this.clearedAtFor(conversation, userId);
    if (clearedAt) filter.createdAt = { $gt: clearedAt };
    return this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate(MESSAGE_POPULATE)
      .exec();
  }

  // Search across every conversation this user is in (the chat list's search box). Newest
  // first, capped; each hit carries its `conversation` id so the client can open + jump to it.
  async searchAllMessages(userId: string, query: string): Promise<MessageDocument[]> {
    const q = query?.trim().slice(0, 100);
    if (!q || q.length < 2) return [];
    const uid = new Types.ObjectId(userId);
    const conversations = await this.conversationModel
      .find({ participants: uid, deletedBy: { $ne: uid } })
      .select('_id clearedBy')
      .lean<{ _id: Types.ObjectId; clearedBy?: { user: Types.ObjectId; at: Date }[] }[]>()
      .exec();
    if (!conversations.length) return [];

    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    const hits = await this.messageModel
      .find({
        conversation: { $in: conversations.map((c) => c._id) },
        deletedFor: { $ne: uid },
        deletedForEveryone: false,
        $or: [{ text: pattern }, { 'poll.question': pattern }],
      })
      .sort({ createdAt: -1 })
      .limit(120)
      .populate(MESSAGE_POPULATE)
      .exec();

    const clearedAt = new Map<string, number>();
    for (const c of conversations) {
      const entry = c.clearedBy?.find((e) => e.user.toString() === userId);
      if (entry) clearedAt.set(c._id.toString(), new Date(entry.at).getTime());
    }
    return hits
      .filter((m) => {
        const cutoff = clearedAt.get(m.conversation.toString());
        return !cutoff || new Date(m.get('createdAt') as Date).getTime() > cutoff;
      })
      .slice(0, 60);
  }

  // --- Helpers for AI features (AiModule's ChatAiService) ---

  // One message, if this user may read it (participant / public group, not deleted for them).
  async getMessageForUser(messageId: string, userId: string): Promise<MessageDocument> {
    if (!Types.ObjectId.isValid(messageId)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findById(messageId).populate(MESSAGE_POPULATE).exec();
    if (!message || message.deletedForEveryone || message.deletedFor.some((d) => d.toString() === userId)) {
      throw new NotFoundException('الرسالة غير موجودة');
    }
    await this.assertCanAccessConversation(message.conversation.toString(), userId, { autoJoin: false });
    return message;
  }

  // The latest `limit` messages this user can see, oldest first -- optionally only those from
  // `sinceId` onward (an "unread since here" catch-up). Flattened to plain data for a prompt.
  async getRecentMessagesForAi(
    conversationId: string,
    userId: string,
    opts: { limit: number; sinceId?: string },
  ): Promise<{ conversation: ConversationDocument; messages: AiTranscriptMessage[] }> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    const filter: Record<string, unknown> = {
      conversation: conversation._id,
      deletedFor: { $ne: new Types.ObjectId(userId) },
      deletedForEveryone: false,
    };
    const createdAt: Record<string, Date> = {};
    const clearedAt = this.clearedAtFor(conversation, userId);
    if (clearedAt) createdAt.$gt = clearedAt;
    if (opts.sinceId && Types.ObjectId.isValid(opts.sinceId)) {
      const pivot = await this.messageModel
        .findOne({ _id: opts.sinceId, conversation: conversation._id })
        .select('createdAt')
        .lean<{ createdAt: Date } | null>()
        .exec();
      if (pivot) createdAt.$gte = pivot.createdAt;
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    const docs = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(opts.limit)
      .select('sender text attachments poll createdAt')
      .populate({ path: 'sender', select: 'name' })
      .lean<
        {
          _id: Types.ObjectId;
          sender: { _id: Types.ObjectId; name: string } | null;
          text: string;
          attachments?: { type: string }[];
          poll?: { question: string; options: { text: string }[] } | null;
          createdAt: Date;
        }[]
      >()
      .exec();

    const messages = docs.reverse().map((d) => ({
      id: d._id.toString(),
      senderId: d.sender?._id?.toString() ?? null,
      senderName: d.sender?.name ?? 'مستخدم محذوف',
      text: d.text ?? '',
      poll: d.poll ? { question: d.poll.question, options: (d.poll.options ?? []).map((o) => o.text) } : null,
      attachmentTypes: (d.attachments ?? []).map((a) => a.type),
      createdAt: d.createdAt,
    }));
    return { conversation, messages };
  }

  // Backs the "Shared media / files / links" tab in group/contact info. Scans the most recent
  // 500 non-deleted messages for this user rather than the whole history -- plenty for a UI
  // gallery, and avoids an unbounded collection scan on very long-lived conversations.
  async getSharedMedia(conversationId: string, userId: string) {
    await this.assertCanAccessConversation(conversationId, userId);
    const clearedEntry = (await this.conversationModel.findById(conversationId).exec())?.clearedBy.find(
      (c) => c.user.toString() === userId,
    );
    const filter: Record<string, unknown> = {
      conversation: new Types.ObjectId(conversationId),
      deletedFor: { $ne: new Types.ObjectId(userId) },
      deletedForEveryone: false,
    };
    if (clearedEntry) filter.createdAt = { $gt: clearedEntry.at };

    const messages = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .select('attachments text createdAt')
      // `timestamps: true` adds createdAt/updatedAt at runtime, but the Message class doesn't
      // declare them, so .lean()'s inferred type needs an explicit assist here.
      .lean<(Pick<Message, 'attachments' | 'text'> & { _id: Types.ObjectId; createdAt: Date })[]>()
      .exec();

    const media: { _id: string; url: string; type: string; createdAt: Date }[] = [];
    const files: { _id: string; url: string; type: string; name: string | null; size: number | null; createdAt: Date }[] = [];
    const links: { messageId: string; url: string; createdAt: Date }[] = [];
    const urlRegex = /https?:\/\/[^\s<>()]+/gi;

    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' || attachment.type === 'video') {
          media.push({ _id: `${message._id}`, url: attachment.url, type: attachment.type, createdAt: message.createdAt as unknown as Date });
        } else if (attachment.type === 'document') {
          files.push({
            _id: `${message._id}`,
            url: attachment.url,
            type: attachment.type,
            name: attachment.name,
            size: attachment.size,
            createdAt: message.createdAt as unknown as Date,
          });
        }
      }
      for (const match of message.text?.matchAll(urlRegex) ?? []) {
        links.push({ messageId: `${message._id}`, url: match[0], createdAt: message.createdAt as unknown as Date });
      }
    }

    return { media, files, links };
  }

  // --- Per-user conversation state: pin / archive / mute / clear ---

  async togglePin(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    const uid = new Types.ObjectId(userId);
    const pinned = conversation.pinnedBy.some((p) => p.toString() === userId);
    conversation.pinnedBy = pinned
      ? (conversation.pinnedBy.filter((p) => p.toString() !== userId) as unknown as Types.ObjectId[])
      : [...conversation.pinnedBy, uid];
    await conversation.save();
    return conversation;
  }

  async toggleArchive(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    const uid = new Types.ObjectId(userId);
    const archived = conversation.archivedBy.some((a) => a.toString() === userId);
    conversation.archivedBy = archived
      ? (conversation.archivedBy.filter((a) => a.toString() !== userId) as unknown as Types.ObjectId[])
      : [...conversation.archivedBy, uid];
    await conversation.save();
    return conversation;
  }

  async muteConversation(conversationId: string, userId: string, minutes?: number): Promise<ConversationDocument> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    const until = minutes ? new Date(Date.now() + minutes * 60_000) : null;
    conversation.mutedBy = [
      ...conversation.mutedBy.filter((m) => m.user.toString() !== userId),
      { user: new Types.ObjectId(userId), until },
    ];
    await conversation.save();
    return conversation;
  }

  async unmuteConversation(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    conversation.mutedBy = conversation.mutedBy.filter((m) => m.user.toString() !== userId);
    await conversation.save();
    return conversation;
  }

  async clearChat(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    conversation.clearedBy = [
      ...conversation.clearedBy.filter((c) => c.user.toString() !== userId),
      { user: new Types.ObjectId(userId), at: new Date() },
    ];
    await conversation.save();
  }

  // "Delete chat" -- hides the conversation from this user's list (see listConversationsForUser)
  // and clears its history for them, same as clearChat. Reappears automatically the next time a
  // message lands in it (see the $pull in saveMessage above).
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.assertCanAccessConversation(conversationId, userId, { autoJoin: false });
    const uid = new Types.ObjectId(userId);
    conversation.clearedBy = [
      ...conversation.clearedBy.filter((c) => c.user.toString() !== userId),
      { user: uid, at: new Date() },
    ];
    if (!conversation.deletedBy.some((d) => d.toString() === userId)) conversation.deletedBy.push(uid);
    await conversation.save();
  }

  // --- Group management ---

  async updateGroupInfo(conversationId: string, userId: string, dto: UpdateConversationDto): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    if (dto.name !== undefined) conversation.name = dto.name;
    if (dto.groupDescription !== undefined) conversation.groupDescription = dto.groupDescription;
    if (dto.groupIcon !== undefined) conversation.groupIcon = dto.groupIcon;
    if (dto.disappearingSeconds !== undefined) conversation.disappearingSeconds = dto.disappearingSeconds;
    if (dto.visibility !== undefined) conversation.visibility = dto.visibility;
    await conversation.save();
    return conversation.populate('participants', PARTICIPANT_FIELDS);
  }

  async addMembers(conversationId: string, userId: string, userIds: string[]): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    const toAdd = userIds.map((id) => new Types.ObjectId(id));
    const existingIds = new Set(conversation.participants.map((p) => p.toString()));
    conversation.participants.push(...toAdd.filter((id) => !existingIds.has(id.toString())));
    // An explicit re-invite lifts a prior removal from a public group.
    const addedSet = new Set(userIds);
    conversation.blockedUsers = conversation.blockedUsers.filter(
      (b) => !addedSet.has(b.toString()),
    ) as unknown as Types.ObjectId[];
    await conversation.save();
    return conversation.populate('participants', PARTICIPANT_FIELDS);
  }

  async removeMember(conversationId: string, userId: string, targetUserId: string): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    if (targetUserId === conversation.createdBy?.toString()) {
      throw new ForbiddenException('لا يمكن إزالة منشئ المجموعة');
    }
    conversation.participants = conversation.participants.filter(
      (p) => p.toString() !== targetUserId,
    ) as unknown as Types.ObjectId[];
    conversation.admins = conversation.admins.filter((a) => a.toString() !== targetUserId) as unknown as Types.ObjectId[];
    // In a public group a removed user would otherwise just re-join by re-opening it -- block
    // them so the removal sticks and the group drops out of their chat list.
    if (conversation.visibility === 'public' && !conversation.blockedUsers.some((b) => b.toString() === targetUserId)) {
      conversation.blockedUsers.push(new Types.ObjectId(targetUserId));
    }
    await conversation.save();
    return conversation.populate('participants', PARTICIPANT_FIELDS);
  }

  async leaveGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, userId);
    if (!conversation.isGroup) throw new ForbiddenException('هذا الإجراء متاح للمجموعات فقط');
    if (conversation.visibility === 'public') {
      throw new BadRequestException('لا يمكنك مغادرة مجموعة عامة');
    }
    conversation.participants = conversation.participants.filter(
      (p) => p.toString() !== userId,
    ) as unknown as Types.ObjectId[];
    conversation.admins = conversation.admins.filter((a) => a.toString() !== userId) as unknown as Types.ObjectId[];
    await conversation.save();
  }

  async setAdmin(conversationId: string, userId: string, targetUserId: string, isAdmin: boolean): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    const isTargetParticipant = conversation.participants.some((p) => p.toString() === targetUserId);
    if (!isTargetParticipant) throw new BadRequestException('هذا المستخدم ليس عضوًا في المجموعة');

    if (isAdmin) {
      if (!conversation.admins.some((a) => a.toString() === targetUserId)) {
        conversation.admins.push(new Types.ObjectId(targetUserId));
      }
    } else {
      if (conversation.admins.length <= 1 && conversation.admins.some((a) => a.toString() === targetUserId)) {
        throw new BadRequestException('يجب أن يبقى مشرف واحد على الأقل في المجموعة');
      }
      conversation.admins = conversation.admins.filter((a) => a.toString() !== targetUserId) as unknown as Types.ObjectId[];
    }
    await conversation.save();
    return conversation.populate('participants', PARTICIPANT_FIELDS);
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // Deliberately metadata-only: participants/counts/timestamps, never full private message
  // content browsing. Moderation is by-ID (once an admin knows about an offending message,
  // e.g. via an off-platform complaint), not a free-browse inbox of everyone's DMs.

  async adminListConversations(page = 1, limit = 20, search?: string): Promise<PaginatedConversations> {
    const filter = search ? { name: { $regex: escapeRegex(search), $options: 'i' } } : {};
    const [data, total] = await Promise.all([
      this.conversationModel
        .find(filter)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('participants isGroup name lastMessageAt createdAt')
        .populate('participants', 'name role photoUrl collegeId')
        .exec(),
      this.conversationModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async adminRemoveMessage(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الرسالة غير موجودة');
    const message = await this.messageModel.findByIdAndDelete(id).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
  }

  async adminRemoveConversation(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المحادثة غير موجودة');
    const conversation = await this.conversationModel.findByIdAndDelete(id).exec();
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    await this.messageModel.deleteMany({ conversation: conversation._id }).exec();
  }

  async getStats(): Promise<ChatStats> {
    const [totalConversations, groupConversations, totalMessages, dailyMessages] = await Promise.all([
      this.conversationModel.countDocuments().exec(),
      this.conversationModel.countDocuments({ isGroup: true }).exec(),
      this.messageModel.countDocuments().exec(),
      this.dailyMessages(14),
    ]);
    return { totalConversations, groupConversations, totalMessages, dailyMessages };
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

  // Chat messages over the trailing `days` window + period-over-period totals (admin console).
  async getMessageTrend(days: number): Promise<TrendSeries> {
    const [series, current, previous] = await Promise.all([
      this.dailyMessages(days),
      this.messageModel.countDocuments({ createdAt: { $gte: daysAgoStart(days) } }).exec(),
      this.messageModel.countDocuments({ createdAt: previousWindowMatch(days) }).exec(),
    ]);
    return { series, current, previous };
  }
}
