import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScheduledMessage, ScheduledMessageDocument } from './schemas/scheduled-message.schema';
import { ScheduleMessageDto } from './dto/schedule-message.dto';
import { ChatService } from './chat.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { isMessageEffect, normalizePollInput, SCHEDULE_LIMITS } from './chat.constants';

// How often the sweep looks for due messages -- a scheduled message goes out within ~this long
// of its time. Cheap: one indexed findOneAndUpdate that matches nothing on most ticks.
const SWEEP_INTERVAL_MS = 15_000;
// Upper bound on deliveries per sweep, so one huge backlog can't monopolize the event loop.
const MAX_PER_SWEEP = 50;
// A row stuck in 'sending' this long (process died mid-delivery) is retried / given up on.
const STUCK_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

// "Send later" (Telegram-style scheduled messages). Rows are claimed with an atomic
// pending -> sending transition, so even several API instances sweeping at once never deliver
// the same message twice. Delivery goes through ChatService.saveMessage, i.e. exactly the live
// send path: membership, blocks, mentions and notifications are all re-evaluated at send time.
@Injectable()
export class ChatSchedulerService {
  private readonly logger = new Logger(ChatSchedulerService.name);
  private sweeping = false;

  constructor(
    @InjectModel(ScheduledMessage.name) private scheduledModel: Model<ScheduledMessageDocument>,
    private readonly chatService: ChatService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async schedule(userId: string, conversationId: string, dto: ScheduleMessageDto): Promise<ScheduledMessageDocument> {
    // Same access rule as a live send (a public group auto-joins on first interaction).
    await this.chatService.assertCanAccessConversation(conversationId, userId);

    const sendAt = new Date(dto.sendAt);
    const lead = sendAt.getTime() - Date.now();
    if (Number.isNaN(sendAt.getTime()) || lead < SCHEDULE_LIMITS.minLeadMs) {
      throw new BadRequestException('اختر وقتًا في المستقبل لإرسال الرسالة');
    }
    if (lead > SCHEDULE_LIMITS.maxLeadMs) {
      throw new BadRequestException('لا يمكن جدولة رسالة لأكثر من سنة');
    }

    const poll = dto.poll ? normalizePollInput(dto.poll) : null;
    if (dto.poll && !poll) throw new BadRequestException('الاستطلاع يحتاج إلى سؤال وخيارين مختلفين على الأقل');
    const text = dto.text?.trim() ?? '';
    if (!text && !dto.attachments?.length && !poll) throw new BadRequestException('لا يمكن جدولة رسالة فارغة');

    const uid = new Types.ObjectId(userId);
    const pendingCount = await this.scheduledModel.countDocuments({ sender: uid, status: 'pending' }).exec();
    if (pendingCount >= SCHEDULE_LIMITS.maxPendingPerUser) {
      throw new BadRequestException('لديك عدد كبير من الرسائل المجدولة بالفعل');
    }

    return new this.scheduledModel({
      conversation: new Types.ObjectId(conversationId),
      sender: uid,
      text,
      attachments: dto.attachments ?? [],
      replyTo: dto.replyTo && Types.ObjectId.isValid(dto.replyTo) ? new Types.ObjectId(dto.replyTo) : null,
      poll,
      effect: isMessageEffect(dto.effect) ? dto.effect : null,
      silent: !!dto.silent,
      sendAt,
    }).save();
  }

  // This user's still-pending scheduled messages in one conversation, soonest first.
  async listPending(userId: string, conversationId: string): Promise<ScheduledMessageDocument[]> {
    if (!Types.ObjectId.isValid(conversationId)) return [];
    return this.scheduledModel
      .find({
        sender: new Types.ObjectId(userId),
        conversation: new Types.ObjectId(conversationId),
        status: 'pending',
      })
      .sort({ sendAt: 1 })
      .limit(SCHEDULE_LIMITS.maxPendingPerUser)
      .exec();
  }

  async cancel(userId: string, id: string): Promise<{ success: true }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الرسالة المجدولة غير موجودة');
    const row = await this.scheduledModel
      .findOneAndUpdate(
        { _id: id, sender: new Types.ObjectId(userId), status: 'pending' },
        { $set: { status: 'canceled' } },
        { new: true },
      )
      .exec();
    if (!row) throw new NotFoundException('الرسالة المجدولة غير موجودة أو أُرسلت بالفعل');
    this.notifyOwner(row);
    return { success: true };
  }

  // "Send now" from the scheduled list -- claims the row the same way the sweep does.
  async sendNow(userId: string, id: string): Promise<{ success: true }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الرسالة المجدولة غير موجودة');
    const row = await this.scheduledModel
      .findOneAndUpdate(
        { _id: id, sender: new Types.ObjectId(userId), status: 'pending' },
        { $set: { status: 'sending' }, $inc: { attempts: 1 } },
        { new: true },
      )
      .exec();
    if (!row) throw new NotFoundException('الرسالة المجدولة غير موجودة أو أُرسلت بالفعل');
    const ok = await this.deliver(row);
    if (!ok) throw new BadRequestException(row.error ?? 'تعذّر إرسال الرسالة');
    return { success: true };
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.recoverStuck();
      for (let i = 0; i < MAX_PER_SWEEP; i++) {
        const row = await this.scheduledModel
          .findOneAndUpdate(
            { status: 'pending', sendAt: { $lte: new Date() } },
            { $set: { status: 'sending' }, $inc: { attempts: 1 } },
            { sort: { sendAt: 1 }, new: true },
          )
          .exec();
        if (!row) break;
        await this.deliver(row);
      }
    } catch (err) {
      this.logger.warn(`Scheduled-message sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  // A process that died between claiming a row and finishing it leaves it in 'sending' forever.
  // Put such rows back in the queue (or give up after MAX_ATTEMPTS).
  private async recoverStuck(): Promise<void> {
    const stale = new Date(Date.now() - STUCK_AFTER_MS);
    await this.scheduledModel
      .updateMany(
        { status: 'sending', updatedAt: { $lt: stale }, attempts: { $lt: MAX_ATTEMPTS } },
        { $set: { status: 'pending' } },
      )
      .exec();
    await this.scheduledModel
      .updateMany(
        { status: 'sending', updatedAt: { $lt: stale }, attempts: { $gte: MAX_ATTEMPTS } },
        { $set: { status: 'failed', error: 'تعذّر إرسال الرسالة المجدولة' } },
      )
      .exec();
  }

  // Sends one claimed row through the live path and broadcasts it. Never throws: the outcome is
  // recorded on the row (sent / failed + reason) and pushed to the sender's open tabs.
  private async deliver(row: ScheduledMessageDocument): Promise<boolean> {
    const conversationId = row.conversation.toString();
    try {
      const attachments = (row.attachments ?? []).map((a) => ({
        url: a.url,
        type: a.type,
        name: a.name ?? undefined,
        size: a.size ?? undefined,
        mimeType: a.mimeType ?? undefined,
        duration: a.duration ?? undefined,
        chunkCount: a.chunkCount ?? undefined,
      }));
      const message = await this.chatService.saveMessage(
        conversationId,
        row.sender.toString(),
        row.text,
        attachments,
        row.replyTo?.toString(),
        { poll: row.poll, effect: row.effect, silent: row.silent },
      );
      this.realtimeEmitter.emitToConversation(conversationId, 'newMessage', message);
      row.status = 'sent';
      row.sentMessage = message._id;
      row.error = null;
      await row.save();
      this.notifyOwner(row);
      return true;
    } catch (err) {
      const reason = (err as { message?: string })?.message;
      row.status = 'failed';
      row.error = typeof reason === 'string' && reason ? reason.slice(0, 200) : 'تعذّر إرسال الرسالة المجدولة';
      await row.save().catch(() => undefined);
      this.notifyOwner(row);
      this.logger.warn(`Scheduled message ${row._id} failed: ${row.error}`);
      return false;
    }
  }

  // Keeps the sender's "scheduled" banner/list in sync across their tabs and devices.
  private notifyOwner(row: ScheduledMessageDocument): void {
    this.realtimeEmitter.emitToUser(row.sender.toString(), 'scheduledUpdated', {
      _id: String(row._id),
      conversation: row.conversation.toString(),
      status: row.status,
      error: row.error,
    });
  }
}
