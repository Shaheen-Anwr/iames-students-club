import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SubscribeDto } from './dto/subscribe.dto';
import { PushPayload } from './push-payload.util';

// Implemented by PushQueueService (optional, REDIS_URL-gated). When attached, the per-user /
// per-cohort sends route through a durable BullMQ queue instead of going out inline. Defined here
// so push.service.ts has no import back to push-queue.service.ts (avoids a module cycle).
export interface PushEnqueuer {
  readonly enabled: boolean;
  enqueueUser(userId: string, payload: PushPayload): Promise<void>;
  enqueueUsers(userIds: string[], payload: PushPayload): Promise<void>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private queue?: PushEnqueuer;

  /** Called once by PushQueueService.onModuleInit when a Redis-backed queue is available. */
  attachQueue(queue: PushEnqueuer): void {
    this.queue = queue;
  }
  private readonly enabled: boolean;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {
    const publicKey = this.config.get<string>('push.publicKey');
    const privateKey = this.config.get<string>('push.privateKey');
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(this.config.get<string>('push.subject')!, publicKey!, privateKey!);
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set -- push notifications are disabled.');
    }
  }

  async subscribe(userId: string, dto: SubscribeDto, userAgent: string | null): Promise<void> {
    // Pull any existing subscription with the same endpoint first (a device re-subscribing gets
    // fresh keys/timestamp) -- $pull and $push can't target the same array path in one update.
    await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: dto.endpoint } } }).exec();
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $push: {
            pushSubscriptions: {
              endpoint: dto.endpoint,
              keys: dto.keys,
              userAgent,
              createdAt: new Date(),
            },
          },
        },
      )
      .exec();
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint } } }).exec();
  }

  // --- Notification preferences ---
  // `dailyDigest` is stored inverted, as `dailyDigestOptOut`, so an existing user (field absent)
  // defaults to opted-in. See DigestService for the digest itself.

  async getDigestPreference(userId: string): Promise<{ dailyDigest: boolean }> {
    const user = await this.userModel.findById(userId).select('dailyDigestOptOut').lean().exec();
    return { dailyDigest: !(user?.dailyDigestOptOut ?? false) };
  }

  async setDigestPreference(userId: string, dailyDigest: boolean): Promise<{ dailyDigest: boolean }> {
    await this.userModel.updateOne({ _id: userId }, { $set: { dailyDigestOptOut: !dailyDigest } }).exec();
    return { dailyDigest };
  }

  // Never throws -- a push failure must never break the in-app notification path that calls it.
  // With a queue attached, hand off and return immediately; otherwise deliver inline (as before).
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    if (this.queue?.enabled) return this.queue.enqueueUser(userId, payload);
    return this.deliverToUser(userId, payload);
  }

  // The actual send. Public so PushQueueService's worker can call it; every other caller goes
  // through sendToUser() above.
  async deliverToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const user = await this.userModel.findById(userId).select('pushSubscriptions').exec();
    if (!user || user.pushSubscriptions.length === 0) return;

    await this.dispatch(userId, user.pushSubscriptions, JSON.stringify(payload));
  }

  // Fan a single payload out to every subscribed device across many users (announcement
  // broadcast). Loads only users who actually have a subscription, and sends in bounded
  // batches so a large cohort doesn't open thousands of push requests at once. Never throws.
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    if (this.queue?.enabled) return this.queue.enqueueUsers(userIds, payload);
    return this.deliverToUsers(userIds, payload);
  }

  async deliverToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;

    const users = await this.userModel
      .find({ _id: { $in: userIds }, 'pushSubscriptions.0': { $exists: true } })
      .select('pushSubscriptions')
      .exec();
    if (users.length === 0) return;

    const body = JSON.stringify(payload);
    const BATCH = 50;
    for (let i = 0; i < users.length; i += BATCH) {
      await Promise.allSettled(
        users.slice(i, i + BATCH).map((u) => this.dispatch(u._id.toString(), u.pushSubscriptions, body)),
      );
    }
  }

  // Fan a payload out to EVERY user who has at least one push subscription -- used for
  // platform-wide, author-less broadcasts (e.g. "a new update just shipped", fired from the
  // release git hook). Streams users through a cursor in bounded batches so the whole user base
  // never loads at once. Never throws; returns a delivery summary for the caller to log/return.
  async broadcastToAll(payload: PushPayload): Promise<{ enabled: boolean; users: number; sent: number; failed: number }> {
    if (!this.enabled) return { enabled: false, users: 0, sent: 0, failed: 0 };

    const body = JSON.stringify(payload);
    const cursor = this.userModel
      .find({ 'pushSubscriptions.0': { $exists: true } })
      .select('_id pushSubscriptions')
      .batchSize(200)
      .cursor();

    let users = 0;
    let sent = 0;
    let failed = 0;
    let batch: Array<Promise<{ sent: number; failed: number }>> = [];
    const drain = async () => {
      const settled = await Promise.all(batch);
      for (const r of settled) {
        sent += r.sent;
        failed += r.failed;
      }
      batch = [];
    };

    for await (const user of cursor) {
      users += 1;
      batch.push(this.dispatch(user._id.toString(), user.pushSubscriptions, body));
      if (batch.length >= 50) await drain();
    }
    await drain();

    this.logger.log(`Broadcast push "${payload.title}" -> ${users} user(s): ${sent} delivered, ${failed} failed.`);
    return { enabled: true, users, sent, failed };
  }

  // Sends `body` to one user's devices and prunes any endpoints the push service reports gone
  // (404/410). Rejections are swallowed here; other status codes are logged, not thrown. Returns
  // per-user delivered/failed counts (ignored by the per-user callers, summed by broadcastToAll).
  private async dispatch(
    userId: string,
    subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[],
    body: string,
  ): Promise<{ sent: number; failed: number }> {
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body).catch((err) => {
          throw { statusCode: err?.statusCode, endpoint: sub.endpoint };
        }),
      ),
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    const deadEndpoints = rejected
      .filter((r) => r.reason?.statusCode === 404 || r.reason?.statusCode === 410)
      .map((r) => r.reason.endpoint as string);

    if (deadEndpoints.length > 0) {
      await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } } }).exec();
    }

    const otherFailures = rejected.filter((r) => r.reason?.statusCode !== 404 && r.reason?.statusCode !== 410);
    if (otherFailures.length > 0) {
      this.logger.warn(`${otherFailures.length} push send(s) failed for user ${userId}: ${otherFailures.map((f) => f.reason?.statusCode).join(', ')}`);
    }

    return { sent: results.length - rejected.length, failed: rejected.length };
  }
}
