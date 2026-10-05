import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatReminder, ChatReminderDocument } from './schemas/chat-reminder.schema';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { messagePreviewText } from './chat.constants';

// A reminder goes out within ~this long of its time.
const SWEEP_INTERVAL_MS = 30_000;
const MAX_PER_SWEEP = 100;
const MIN_LEAD_MS = 30_000;
const MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PENDING_PER_USER = 50;

export interface ReminderView {
  _id: string;
  messageId: string;
  conversationId: string;
  remindAt: Date;
  preview: string;
  messageCreatedAt: Date;
}

function toView(row: ChatReminderDocument | (ChatReminder & { _id: Types.ObjectId })): ReminderView {
  return {
    _id: String(row._id),
    messageId: String(row.message),
    conversationId: String(row.conversation),
    remindAt: row.remindAt,
    preview: row.preview,
    messageCreatedAt: row.messageCreatedAt,
  };
}

// "ذكّرني" -- remind me about this message later. Private to the user who set it. Rows are claimed
// with an atomic pending -> sending transition (same pattern as ChatSchedulerService) so several
// API instances sweeping at once never deliver one reminder twice.
@Injectable()
export class ChatRemindersService {
  private readonly logger = new Logger(ChatRemindersService.name);
  private sweeping = false;

  constructor(
    @InjectModel(ChatReminder.name) private readonly reminderModel: Model<ChatReminderDocument>,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, messageId: string, at: string): Promise<ReminderView> {
    const remindAt = new Date(at);
    const lead = remindAt.getTime() - Date.now();
    if (Number.isNaN(remindAt.getTime()) || lead < MIN_LEAD_MS) {
      throw new BadRequestException('اختر وقتًا في المستقبل للتذكير');
    }
    if (lead > MAX_LEAD_MS) throw new BadRequestException('لا يمكن ضبط تذكير لأكثر من سنة');

    // Validates access (participant / public group, not deleted for this user).
    const message = await this.chatService.getMessageForUser(messageId, userId);
    const uid = new Types.ObjectId(userId);

    const pending = await this.reminderModel.countDocuments({ user: uid, status: 'pending' }).exec();
    if (pending >= MAX_PENDING_PER_USER &&
      !(await this.reminderModel.exists({ user: uid, message: message._id, status: 'pending' }).exec())) {
      throw new BadRequestException('لديك عدد كبير من التذكيرات بالفعل');
    }

    const preview =
      messagePreviewText({
        text: message.text,
        attachments: message.attachments,
        poll: message.poll,
        call: message.call,
        card: message.card,
      }) || 'رسالة';

    // One live reminder per message: setting a new time replaces the old one.
    const upsert = () => this.reminderModel
      .findOneAndUpdate(
        { user: uid, message: message._id, status: 'pending' },
        {
          $set: {
            conversation: message.conversation,
            remindAt,
            preview: preview.slice(0, 200),
            messageCreatedAt: message.get('createdAt') as Date,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    let row: ChatReminderDocument;
    try {
      row = await upsert();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      row = await upsert();
    }
    return toView(row);
  }

  async listPending(userId: string): Promise<ReminderView[]> {
    const rows = await this.reminderModel
      .find({ user: new Types.ObjectId(userId), status: 'pending' })
      .sort({ remindAt: 1 })
      .limit(MAX_PENDING_PER_USER)
      .lean<(ChatReminder & { _id: Types.ObjectId })[]>()
      .exec();
    return rows.map(toView);
  }

  async cancel(userId: string, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('التذكير غير موجود');
    const res = await this.reminderModel
      .updateOne({ _id: id, user: new Types.ObjectId(userId), status: 'pending' }, { $set: { status: 'canceled' } })
      .exec();
    if (!res.matchedCount) throw new NotFoundException('التذكير غير موجود');
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      // A process may have stopped after claiming a reminder. Reclaim old leases on the next
      // sweep; notification delivery is at-least-once if a process dies after sending.
      await this.reminderModel.updateMany(
        { status: 'sending', updatedAt: { $lt: new Date(Date.now() - 5 * 60_000) } },
        { $set: { status: 'pending' } },
      ).exec();
      for (let i = 0; i < MAX_PER_SWEEP; i++) {
        const row = await this.reminderModel
          .findOneAndUpdate(
            { status: 'pending', remindAt: { $lte: new Date() } },
            { $set: { status: 'sending' } },
            { sort: { remindAt: 1 }, new: true },
          )
          .exec();
        if (!row) break;
        await this.deliver(row);
      }
    } catch (err) {
      this.logger.warn(`Reminder sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async deliver(row: ChatReminderDocument): Promise<void> {
    const conversationId = String(row.conversation);
    const link =
      `/chat/${conversationId}?m=${String(row.message)}` +
      `&t=${encodeURIComponent(new Date(row.messageCreatedAt).toISOString())}`;
    try {
      await this.chatService.getMessageForUser(String(row.message), String(row.user));
      await this.notificationsService.create({
        recipient: row.user,
        actor: row.user,
        type: 'chat_reminder',
        conversationId,
        preview: row.preview,
        link,
      });
      row.status = 'sent';
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof NotFoundException) {
        row.status = 'canceled';
        await row.save();
        return;
      }
      // Back to pending a few minutes out, so a transient failure retries instead of vanishing.
      row.status = 'pending';
      row.remindAt = new Date(Date.now() + 5 * 60_000);
      this.logger.warn(`Reminder ${String(row._id)} failed: ${(err as Error).message}`);
    }
    await row.save();
  }
}
