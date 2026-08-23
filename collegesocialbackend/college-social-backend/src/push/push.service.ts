import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SubscribeDto } from './dto/subscribe.dto';
import { PushPayload } from './push-payload.util';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
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

  // Never throws -- a push failure must never break the in-app notification path that calls it.
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const user = await this.userModel.findById(userId).select('pushSubscriptions').exec();
    if (!user || user.pushSubscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(
      user.pushSubscriptions.map((sub) =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body).catch((err) => {
          throw { statusCode: err?.statusCode, endpoint: sub.endpoint };
        }),
      ),
    );

    const deadEndpoints = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .filter((r) => r.reason?.statusCode === 404 || r.reason?.statusCode === 410)
      .map((r) => r.reason.endpoint as string);

    if (deadEndpoints.length > 0) {
      await this.userModel.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } } }).exec();
    }

    const otherFailures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && r.reason?.statusCode !== 404 && r.reason?.statusCode !== 410,
    );
    if (otherFailures.length > 0) {
      this.logger.warn(`${otherFailures.length} push send(s) failed for user ${userId}: ${otherFailures.map((f) => f.reason?.statusCode).join(', ')}`);
    }
  }
}
