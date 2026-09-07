import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { ScheduleEntry, ScheduleEntryDocument } from './schemas/schedule-entry.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PushService } from '../push/push.service';
import { PushPayload } from '../push/push-payload.util';

// "Your lecture starts in 15 minutes" push. The single strongest daily-return hook for a student
// app -- it makes them open the app *before* they'd otherwise think to.
//
// A 5-minute cron; each run looks LEAD_MINUTES ahead (± the cron cadence) for timetable slots
// about to start, and pushes every student in that class's group who has a subscription and
// hasn't opted out. Dedup is per (entry, local-date) in memory -- a redeploy inside the window
// could theoretically re-send one class once, which is a fine trade for not adding a schema field.
const LEAD_MINUTES = 15;
const CRON_STEP_MINUTES = 5;

// "HH:mm" -> minutes since local midnight. Timetable strings are always zero-padded 24h.
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class ScheduleReminderService {
  private readonly logger = new Logger(ScheduleReminderService.name);
  // key: `${entryId}:${localYYYY-MM-DD}` -> already pushed this run-day.
  private readonly sent = new Set<string>();
  private sentDay = '';

  constructor(
    @InjectModel(ScheduleEntry.name) private readonly entryModel: Model<ScheduleEntryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  private tzOffsetHours(): number {
    return this.config.get<number>('appTzOffsetHours') ?? 3;
  }

  /** Local wall-clock now, as a Date whose UTC fields read as local (same trick DigestService uses). */
  private localNow(now = new Date()): Date {
    return new Date(now.getTime() + this.tzOffsetHours() * 3_600_000);
  }

  @Cron(`*/${CRON_STEP_MINUTES} * * * *`, { name: 'class-reminders' })
  async run(): Promise<void> {
    const local = this.localNow();
    const dayStr = local.toISOString().slice(0, 10);
    if (dayStr !== this.sentDay) {
      this.sent.clear();
      this.sentDay = dayStr;
    }

    const dayOfWeek = local.getUTCDay(); // 0 Sun .. 6 Sat -- matches ScheduleEntry.dayOfWeek
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    // Slots starting in the next [LEAD - step, LEAD + step] minutes. Windows overlap between
    // consecutive cron runs on purpose -- the per-entry `sent` set makes a slot fire exactly
    // once, and the overlap means a single skipped/late cron run doesn't drop a reminder.
    const fromMin = nowMin + LEAD_MINUTES - CRON_STEP_MINUTES;
    const toMin = nowMin + LEAD_MINUTES + CRON_STEP_MINUTES;
    if (fromMin < 0 || toMin >= 1440) return; // don't wrap past midnight

    const entries = await this.entryModel
      .find({ dayOfWeek, startTime: { $gte: toHHMM(fromMin), $lte: toHHMM(toMin) } })
      .lean()
      .exec();
    if (entries.length === 0) return;

    for (const entry of entries) {
      const key = `${String(entry._id)}:${dayStr}`;
      if (this.sent.has(key)) continue;
      this.sent.add(key);

      const recipients = await this.userModel
        .find({
          department: entry.department,
          academicYear: entry.academicYear,
          specialization: entry.specialization,
          classRemindersOptOut: { $ne: true },
          'pushSubscriptions.0': { $exists: true },
        })
        .select('_id')
        .lean()
        .exec();
      if (recipients.length === 0) continue;

      const mins = toMinutes(entry.startTime) - nowMin;
      await this.pushService.sendToUsers(
        recipients.map((u) => String(u._id)),
        this.payloadFor(entry.courseName, entry.location, entry.startTime, mins),
      );
      this.logger.log(`class-reminder: "${entry.courseName}" @${entry.startTime} -> ${recipients.length} student(s)`);
    }
  }

  private payloadFor(courseName: string, location: string | null, startTime: string, minsAway: number): PushPayload {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const when = minsAway <= 1 ? 'الآن' : `بعد ${minsAway} دقيقة`;
    const where = location ? ` · ${location}` : '';
    return {
      title: `📚 محاضرتك ${when}`,
      body: `${courseName} — ${startTime}${where}`,
      url: `${frontendUrl}/study/schedule?src=classreminder`,
      icon: `${frontendUrl}/icons/icon-192.png`,
      tag: 'class-reminder',
    };
  }

  /** Fired from POST /schedule/reminders/test -- a canned reminder to the caller only. */
  async sendTestTo(userId: string): Promise<{ message: string }> {
    await this.pushService.sendToUser(userId, this.payloadFor('محاضرة تجريبية', 'قاعة ١٠١', '09:00', LEAD_MINUTES));
    return { message: 'تم إرسال تنبيه تجريبي. تحقق من إشعارات هاتفك.' };
  }
}
