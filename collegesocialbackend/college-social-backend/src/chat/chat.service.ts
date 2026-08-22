import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AttachmentDto } from './dto/create-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { DailyCount, daysAgoStart, fillDailyCounts } from '../common/utils/daily-counts.util';
import { extractMentionIds } from '../common/utils/tag-parser.util';
import { UsersService } from '../users/users.service';

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

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name role photoUrl collegeId' },
  { path: 'reactions.user', select: 'name' },
  {
    path: 'replyTo',
    select: 'text sender attachments deletedForEveryone',
    populate: { path: 'sender', select: 'name' },
  },
];

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async createConversation(creatorId: string, dto: CreateConversationDto): Promise<ConversationDocument> {
    const participantIds = Array.from(new Set([creatorId, ...dto.participantIds]));
    const isGroup = dto.isGroup ?? false;

    if (isGroup && !dto.name?.trim()) {
      throw new BadRequestException('اسم المجموعة مطلوب');
    }

    // For 1-to-1 chats, reuse an existing conversation instead of creating duplicates
    if (!isGroup && participantIds.length === 2) {
      const existing = await this.conversationModel
        .findOne({
          isGroup: false,
          participants: { $all: participantIds, $size: 2 },
        })
        .populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt')
        .exec();
      if (existing) return existing;
    }

    const conversation = new this.conversationModel({
      participants: participantIds.map((id) => new Types.ObjectId(id)),
      isGroup,
      name: dto.name ?? null,
      createdBy: new Types.ObjectId(creatorId),
      admins: isGroup ? [new Types.ObjectId(creatorId)] : [],
    });
    await conversation.save();
    // The frontend expects populated User objects in `participants`, same as
    // listConversationsForUser() -- without this, callers get raw ObjectIds instead.
    return conversation.populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt');
  }

  async listConversationsForUser(userId: string): Promise<(ConversationDocument & { unreadCount: number })[]> {
    const uid = new Types.ObjectId(userId);
    const conversations = await this.conversationModel
      .find({ participants: uid })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt')
      .exec();

    const unreadCounts = await this.messageModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            conversation: { $in: conversations.map((c) => c._id) },
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

  async assertParticipant(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation) throw new NotFoundException('المحادثة غير موجودة');
    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) throw new ForbiddenException('أنت لست جزءًا من هذه المحادثة');
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

  async getMessages(conversationId: string, userId: string, page = 1, limit = 30): Promise<MessageDocument[]> {
    const conversation = await this.assertParticipant(conversationId, userId);
    await this.purgeExpiredMessages(conversation);

    const clearedEntry = conversation.clearedBy.find((c) => c.user.toString() === userId);
    const filter: Record<string, unknown> = {
      conversation: new Types.ObjectId(conversationId),
      deletedFor: { $ne: new Types.ObjectId(userId) },
    };
    if (clearedEntry) filter.createdAt = { $gt: clearedEntry.at };

    return this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
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
  ): Promise<MessageDocument> {
    const conversation = await this.assertParticipant(conversationId, senderId);
    if (!text?.trim() && !attachments?.length) {
      throw new BadRequestException('لا يمكن إرسال رسالة فارغة');
    }

    // A mention only counts if that user is actually a participant of this conversation --
    // otherwise it's a stale/tampered token and gets silently dropped, same as an invalid user id.
    const participantIds = new Set(conversation.participants.map((p) => p.toString()));
    const candidateMentionIds = extractMentionIds(text ?? '').filter((id) => id !== senderId && participantIds.has(id));
    const validMentionIds = await this.usersService.findExistingIds(candidateMentionIds);
    const mentions = validMentionIds.map((id) => new Types.ObjectId(id));

    const message = await new this.messageModel({
      conversation: new Types.ObjectId(conversationId),
      sender: new Types.ObjectId(senderId),
      text: text ?? '',
      attachments: attachments ?? [],
      replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
      readBy: [new Types.ObjectId(senderId)],
      deliveredTo: [new Types.ObjectId(senderId)],
      mentions,
    }).save();

    const previewText = text?.slice(0, 120) || this.attachmentPreview(attachments);
    await this.conversationModel
      .findByIdAndUpdate(conversationId, {
        lastMessagePreview: previewText,
        lastMessageAt: new Date(),
      })
      .exec();

    const mentionedIds = new Set(validMentionIds);
    for (const participant of conversation.participants) {
      const recipientId = participant.toString();
      if (recipientId === senderId) continue;
      // A specifically @mentioned participant gets the more specific 'mention' notification
      // instead of the generic 'chat_message' one, so nobody gets pinged twice for one message.
      await this.notificationsService.create({
        recipient: recipientId,
        actor: senderId,
        type: mentionedIds.has(recipientId) ? 'mention' : 'chat_message',
        conversationId,
        preview: previewText,
      });
    }

    return message.populate(MESSAGE_POPULATE);
  }

  private attachmentPreview(attachments?: AttachmentDto[]): string {
    if (!attachments?.length) return '';
    const labels: Record<string, string> = {
      image: 'صورة 📷',
      video: 'فيديو 🎥',
      audio: 'ملف صوتي 🎵',
      voice: 'رسالة صوتية 🎤',
      document: 'مستند 📄',
    };
    return labels[attachments[0].type] ?? 'أرسل مرفقًا';
  }

  private async getOwnMessage(messageId: string, userId: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    if (message.sender.toString() !== userId) throw new ForbiddenException('لا يمكنك تعديل رسالة مستخدم آخر');
    return message;
  }

  async editMessage(messageId: string, userId: string, text: string): Promise<MessageDocument> {
    const message = await this.getOwnMessage(messageId, userId);
    if (message.deletedForEveryone) throw new BadRequestException('تم حذف هذه الرسالة');
    message.text = text;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  async deleteMessage(messageId: string, userId: string, forEveryone: boolean): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertParticipant(message.conversation.toString(), userId);

    if (forEveryone) {
      if (message.sender.toString() !== userId) {
        throw new ForbiddenException('لا يمكنك حذف رسالة مستخدم آخر لدى الجميع');
      }
      message.deletedForEveryone = true;
      message.text = '';
      message.attachments = [];
      message.reactions = [];
    } else {
      const uid = new Types.ObjectId(userId);
      if (!message.deletedFor.some((d) => d.toString() === userId)) message.deletedFor.push(uid);
    }
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  async reactToMessage(messageId: string, userId: string, emoji: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertParticipant(message.conversation.toString(), userId);

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

  async forwardMessage(messageId: string, userId: string, conversationIds: string[]): Promise<MessageDocument[]> {
    const original = await this.messageModel.findById(messageId).exec();
    if (!original) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertParticipant(original.conversation.toString(), userId);
    if (original.deletedForEveryone) throw new BadRequestException('تم حذف هذه الرسالة');

    const results: MessageDocument[] = [];
    for (const conversationId of conversationIds) {
      const conversation = await this.assertParticipant(conversationId, userId);
      const message = await new this.messageModel({
        conversation: conversation._id,
        sender: new Types.ObjectId(userId),
        text: original.text,
        attachments: original.attachments,
        forwarded: true,
        readBy: [new Types.ObjectId(userId)],
        deliveredTo: [new Types.ObjectId(userId)],
      }).save();

      const previewText = message.text?.slice(0, 120) || this.attachmentPreview(message.attachments as unknown as AttachmentDto[]);
      await this.conversationModel
        .findByIdAndUpdate(conversationId, { lastMessagePreview: previewText, lastMessageAt: new Date() })
        .exec();

      for (const participant of conversation.participants) {
        const recipientId = participant.toString();
        if (recipientId === userId) continue;
        await this.notificationsService.create({
          recipient: recipientId,
          actor: userId,
          type: 'chat_message',
          conversationId,
          preview: previewText,
        });
      }

      results.push(await message.populate(MESSAGE_POPULATE));
    }
    return results;
  }

  async markDelivered(conversationId: string, userId: string): Promise<string[]> {
    const uid = new Types.ObjectId(userId);
    const undelivered = await this.messageModel
      .find({ conversation: new Types.ObjectId(conversationId), sender: { $ne: uid }, deliveredTo: { $ne: uid } })
      .select('_id')
      .exec();
    if (!undelivered.length) return [];
    await this.messageModel
      .updateMany({ _id: { $in: undelivered.map((m) => m._id) } }, { $addToSet: { deliveredTo: uid } })
      .exec();
    return undelivered.map((m) => (m._id as Types.ObjectId).toString());
  }

  async markRead(conversationId: string, userId: string): Promise<string[]> {
    await this.assertParticipant(conversationId, userId);
    const uid = new Types.ObjectId(userId);
    const unread = await this.messageModel
      .find({ conversation: new Types.ObjectId(conversationId), sender: { $ne: uid }, readBy: { $ne: uid } })
      .select('_id')
      .exec();
    if (!unread.length) return [];
    await this.messageModel
      .updateMany(
        { _id: { $in: unread.map((m) => m._id) } },
        { $addToSet: { readBy: uid, deliveredTo: uid } },
      )
      .exec();
    return unread.map((m) => (m._id as Types.ObjectId).toString());
  }

  async starMessage(messageId: string, userId: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertParticipant(message.conversation.toString(), userId);
    const uid = new Types.ObjectId(userId);
    if (!message.starredBy.some((s) => s.toString() === userId)) message.starredBy.push(uid);
    await message.save();
    return message.populate(MESSAGE_POPULATE);
  }

  async unstarMessage(messageId: string, userId: string): Promise<MessageDocument> {
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertParticipant(message.conversation.toString(), userId);
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

  async searchMessages(conversationId: string, userId: string, query: string): Promise<MessageDocument[]> {
    await this.assertParticipant(conversationId, userId);
    if (!query?.trim()) return [];
    return this.messageModel
      .find({
        conversation: new Types.ObjectId(conversationId),
        deletedFor: { $ne: new Types.ObjectId(userId) },
        deletedForEveryone: false,
        text: { $regex: query.trim(), $options: 'i' },
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate(MESSAGE_POPULATE)
      .exec();
  }

  // Backs the "Shared media / files / links" tab in group/contact info. Scans the most recent
  // 500 non-deleted messages for this user rather than the whole history -- plenty for a UI
  // gallery, and avoids an unbounded collection scan on very long-lived conversations.
  async getSharedMedia(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);
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
    const conversation = await this.assertParticipant(conversationId, userId);
    const uid = new Types.ObjectId(userId);
    const pinned = conversation.pinnedBy.some((p) => p.toString() === userId);
    conversation.pinnedBy = pinned
      ? (conversation.pinnedBy.filter((p) => p.toString() !== userId) as unknown as Types.ObjectId[])
      : [...conversation.pinnedBy, uid];
    await conversation.save();
    return conversation;
  }

  async toggleArchive(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertParticipant(conversationId, userId);
    const uid = new Types.ObjectId(userId);
    const archived = conversation.archivedBy.some((a) => a.toString() === userId);
    conversation.archivedBy = archived
      ? (conversation.archivedBy.filter((a) => a.toString() !== userId) as unknown as Types.ObjectId[])
      : [...conversation.archivedBy, uid];
    await conversation.save();
    return conversation;
  }

  async muteConversation(conversationId: string, userId: string, minutes?: number): Promise<ConversationDocument> {
    const conversation = await this.assertParticipant(conversationId, userId);
    const until = minutes ? new Date(Date.now() + minutes * 60_000) : null;
    conversation.mutedBy = [
      ...conversation.mutedBy.filter((m) => m.user.toString() !== userId),
      { user: new Types.ObjectId(userId), until },
    ];
    await conversation.save();
    return conversation;
  }

  async unmuteConversation(conversationId: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.assertParticipant(conversationId, userId);
    conversation.mutedBy = conversation.mutedBy.filter((m) => m.user.toString() !== userId);
    await conversation.save();
    return conversation;
  }

  async clearChat(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, userId);
    conversation.clearedBy = [
      ...conversation.clearedBy.filter((c) => c.user.toString() !== userId),
      { user: new Types.ObjectId(userId), at: new Date() },
    ];
    await conversation.save();
  }

  // --- Group management ---

  async updateGroupInfo(conversationId: string, userId: string, dto: UpdateConversationDto): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    if (dto.name !== undefined) conversation.name = dto.name;
    if (dto.groupDescription !== undefined) conversation.groupDescription = dto.groupDescription;
    if (dto.groupIcon !== undefined) conversation.groupIcon = dto.groupIcon;
    if (dto.disappearingSeconds !== undefined) conversation.disappearingSeconds = dto.disappearingSeconds;
    await conversation.save();
    return conversation.populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt');
  }

  async addMembers(conversationId: string, userId: string, userIds: string[]): Promise<ConversationDocument> {
    const conversation = await this.assertGroupAdmin(conversationId, userId);
    const toAdd = userIds.map((id) => new Types.ObjectId(id));
    const existingIds = new Set(conversation.participants.map((p) => p.toString()));
    conversation.participants.push(...toAdd.filter((id) => !existingIds.has(id.toString())));
    await conversation.save();
    return conversation.populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt');
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
    await conversation.save();
    return conversation.populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt');
  }

  async leaveGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.assertParticipant(conversationId, userId);
    if (!conversation.isGroup) throw new ForbiddenException('هذا الإجراء متاح للمجموعات فقط');
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
    return conversation.populate('participants', 'name role photoUrl collegeId isOnline lastSeenAt');
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // Deliberately metadata-only: participants/counts/timestamps, never full private message
  // content browsing. Moderation is by-ID (once an admin knows about an offending message,
  // e.g. via an off-platform complaint), not a free-browse inbox of everyone's DMs.

  async adminListConversations(page = 1, limit = 20, search?: string): Promise<PaginatedConversations> {
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
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
    const message = await this.messageModel.findByIdAndDelete(id).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
  }

  async adminRemoveConversation(id: string): Promise<void> {
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
}
