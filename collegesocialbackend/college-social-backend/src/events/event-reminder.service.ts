import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { NotificationsService } from '../notifications/notifications.service';

// How far ahead an event is "starting soon". The cron runs hourly, so a 3h window means every
// attendee gets exactly one reminder 2-3h before the event.
const LEAD_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class EventReminderService {
  private readonly logger = new Logger(EventReminderService.name);

  constructor(
    @InjectModel(Event.name) private readonly model: Model<EventDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  // Top of every hour. Idempotent via `reminderSentAt` -- an event is reminded exactly once.
  @Cron('5 * * * *', { name: 'event-reminders' })
  async run(): Promise<void> {
    const now = Date.now();
    const due = await this.model
      .find({
        reminderSentAt: null,
        startsAt: { $gt: new Date(now), $lte: new Date(now + LEAD_MS) },
      })
      .limit(200)
      .exec();
    if (due.length === 0) return;

    let pushed = 0;
    for (const event of due) {
      const creatorId = event.createdBy.toString();
      for (const attendee of event.attendees) {
        const recipient = attendee.toString();
        if (recipient === creatorId) continue; // the organiser already knows
        try {
          await this.notifications.create({
            recipient,
            actor: creatorId,
            type: 'event_reminder',
            preview: event.title,
          });
          pushed += 1;
        } catch (err) {
          this.logger.warn(`event reminder failed for ${recipient}: ${(err as Error).message}`);
        }
      }
      event.reminderSentAt = new Date();
      await event.save();
    }
    this.logger.log(`Event reminders: ${pushed} notification(s) for ${due.length} event(s).`);
  }
}
