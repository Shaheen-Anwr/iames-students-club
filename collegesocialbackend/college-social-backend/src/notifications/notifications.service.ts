import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType } from './schemas/notification.schema';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { PushService } from '../push/push.service';
import { buildPushPayload } from '../push/push-payload.util';

export interface NotificationStats {
  total: number;
  unread: number;
  readRatePercent: number;
  byType: Record<string, number>;
}

interface CreateNotificationInput {
  recipient: string | Types.ObjectId;
  actor: string | Types.ObjectId;
  type: NotificationType;
  conversationId?: string | null;
  channelId?: string | null;
  groupId?: string | null;
  postId?: string | null;
  reelId?: string | null;
  questionId?: string | null;
  preview?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    const notification = await new this.notificationModel({
      recipient: new Types.ObjectId(input.recipient),
      actor: new Types.ObjectId(input.actor),
      type: input.type,
      conversationId: input.conversationId ?? null,
      channelId: input.channelId ?? null,
      groupId: input.groupId ?? null,
      postId: input.postId ?? null,
      reelId: input.reelId ?? null,
      questionId: input.questionId ?? null,
      preview: input.preview ?? null,
    }).save();

    const populated = await notification.populate('actor', 'name role photoUrl');
    this.realtimeEmitter.emitToUser(input.recipient.toString(), 'newNotification', populated);

    // Fire-and-forget -- a push failure must never break notification creation itself.
    const frontendUrl = this.config.get<string>('frontendUrl')!;
    this.pushService
      .sendToUser(input.recipient.toString(), buildPushPayload(populated, frontendUrl))
      .catch((err) => this.logger.warn(`Push send failed: ${err?.message ?? err}`));

    return populated;
  }

  // Fans a single platform/department announcement out to one notification per recipient. Kept
  // separate from create() because these are written in bulk (insertMany) rather than one save()
  // per row. `actorId` is the announcement's author -- carried so the recipient sees who posted
  // it (photo + name), the same as any other notification. Never throws -- a broadcast must not
  // fail the announcement.
  async createSystemBroadcast(
    recipientIds: Types.ObjectId[],
    data: { title: string; preview: string; link: string },
    actorId?: string | Types.ObjectId | null,
  ): Promise<void> {
    if (recipientIds.length === 0) return;

    const actor = actorId ? new Types.ObjectId(actorId) : null;
    const rows = recipientIds.map((recipient) => ({
      recipient,
      actor,
      type: 'system_announcement' as const,
      title: data.title,
      preview: data.preview,
      link: data.link,
      read: false,
    }));

    try {
      // ordered: false -- one bad row (e.g. a since-deleted user) shouldn't abort the rest.
      const inserted = await this.notificationModel.insertMany(rows, { ordered: false });
      // Populate the actor once for the whole batch so the live `newNotification` payload carries
      // the announcer's name/photo, matching what listForUser() returns on a later refetch.
      if (actor) await this.notificationModel.populate(inserted, { path: 'actor', select: 'name role photoUrl' });
      for (const doc of inserted) {
        this.realtimeEmitter.emitToUser(doc.recipient.toString(), 'newNotification', doc);
      }
    } catch (err) {
      this.logger.warn(`System broadcast insert partially failed: ${(err as Error)?.message ?? err}`);
    }
  }

  async listForUser(userId: string, page = 1, limit = 20): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({ recipient: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name role photoUrl')
      .exec();
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ recipient: new Types.ObjectId(userId), read: false }).exec();
  }

  async markRead(id: string, userId: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel.findById(id).exec();
    if (!notification) throw new NotFoundException('الإشعار غير موجود');
    if (notification.recipient.toString() !== userId) {
      throw new ForbiddenException('لا يمكنك الوصول إلى إشعارات مستخدم آخر');
    }
    notification.read = true;
    return notification.save();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany({ recipient: new Types.ObjectId(userId), read: false }, { read: true }).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---
  // Analytics only -- platform-wide broadcasts already exist via AnnouncementsService.create()
  // with department: null, so there's no separate "send to everyone" mechanism here.

  async getStats(): Promise<NotificationStats> {
    const [total, unread, byTypeRows] = await Promise.all([
      this.notificationModel.countDocuments().exec(),
      this.notificationModel.countDocuments({ read: false }).exec(),
      this.notificationModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
    ]);
    const byType = Object.fromEntries(byTypeRows.map((r) => [r._id, r.count]));
    return {
      total,
      unread,
      readRatePercent: total ? Math.round(((total - unread) / total) * 1000) / 10 : 0,
      byType,
    };
  }
}
