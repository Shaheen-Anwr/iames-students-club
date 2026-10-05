import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { ChatStatus, ChatStatusDocument } from './schemas/chat-status.schema';
import { CreateChatStatusDto } from './dto/create-chat-status.dto';

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ChatStatusService {
  private readonly logger = new Logger(ChatStatusService.name);

  constructor(
    @InjectModel(ChatStatus.name) private readonly statuses: Model<ChatStatusDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Conversation.name) private readonly conversations: Model<ConversationDocument>,
    private readonly modules: ModuleRef,
  ) {}

  async list(userId: string) {
    const uid = new Types.ObjectId(userId);
    const [viewer, direct] = await Promise.all([
      this.users.findById(uid).select('friends blockedUsers').lean().exec(),
      this.conversations.find({ participants: uid, isGroup: false }).select('participants').lean().exec(),
    ]);
    if (!viewer) throw new NotFoundException('المستخدم غير موجود');
    const candidates = new Set<string>([userId, ...(viewer.friends ?? []).map(String)]);
    direct.forEach((conversation) => conversation.participants.forEach((id) => candidates.add(String(id))));
    // Check both sides of a block in one query. Group membership alone does not make every
    // classmate a contact; only friends and people with an existing DM can see the status.
    const authors = await this.users.find({
      _id: { $in: [...candidates].map((id) => new Types.ObjectId(id)), $nin: viewer.blockedUsers ?? [] },
      blockedUsers: { $ne: uid },
    }).select('_id').lean().exec();
    return this.statuses.find({ author: { $in: authors.map((author) => author._id) }, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 }).limit(200).populate('author', 'name photoUrl').exec();
  }

  async create(userId: string, input: CreateChatStatusDto) {
    const text = (input.text ?? '').trim();
    if (!text && !input.imageUrl) throw new BadRequestException('أضف نصًا أو صورة للحالة');
    if (text.length > 600) throw new BadRequestException('الحد الأقصى 600 حرف');
    const now = new Date();
    const active = await this.statuses.countDocuments({ author: new Types.ObjectId(userId), expiresAt: { $gt: now } });
    if (active >= 5) throw new BadRequestException('يمكنك مشاركة خمس حالات خلال 24 ساعة، احذف حالة أولًا');
    await this.moderate(text);
    const status = await this.statuses.create({
      author: new Types.ObjectId(userId), text, imageUrl: input.imageUrl ?? null,
      expiresAt: new Date(now.getTime() + STATUS_LIFETIME_MS),
    });
    return status.populate('author', 'name photoUrl');
  }

  async remove(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الحالة غير موجودة');
    const result = await this.statuses.deleteOne({ _id: new Types.ObjectId(id), author: new Types.ObjectId(userId) });
    if (!result.deletedCount) throw new NotFoundException('الحالة غير موجودة');
    return { success: true };
  }

  private async moderate(text: string) {
    if (!text) return;
    // Same contact-information floor and fail-open AI policy used on the student wall.
    if (/\b\d{7,}\b/.test(text) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
      throw new BadRequestException('لا تنشر أرقام هواتف أو بريدًا إلكترونيًا في الحالة');
    }
    let result: { allowed?: boolean; reason?: string } | undefined;
    try {
      // AiModule already imports ChatModule. Resolve lazily after bootstrap to reuse its AI
      // client without introducing a circular module dependency just for text moderation.
      const ai = this.modules.get(AiService, { strict: false });
      if (!ai?.isConfigured) return;
      result = await ai.completeJson<{ allowed?: boolean; reason?: string }>(
        'أنت مشرف حالات طلابية. امنع التنمر الموجه والتهديد والعنف والكراهية والمحتوى الجنسي الصريح ' +
        'وكشف معلومات خاصة. اسمح بالدردشة والنقد والطرافة. أعد JSON فقط: {"allowed": boolean, "reason": "سبب قصير"}.',
        text, { maxTokens: 200, temperature: 0, timeoutMs: 15_000 },
      );
    } catch (error) {
      this.logger.warn(`Status text moderation unavailable: ${(error as Error).message}`);
    }
    if (result?.allowed === false) throw new BadRequestException(result.reason || 'الحالة مخالفة لقواعد المنصة');
  }
}
