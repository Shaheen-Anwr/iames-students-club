import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ScheduleService } from '../schedule/schedule.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { PushService } from '../push/push.service';
import { PushPayload } from '../push/push-payload.util';
import { ScheduleEntryDocument } from '../schedule/schemas/schedule-entry.schema';
import { Role } from '../common/enums/role.enum';
import { Department } from '../common/enums/department.enum';
import { DEFAULT_DIGEST_HOUR, localHour } from '../common/utils/notification-prefs.util';
import { GamificationService } from '../gamification/gamification.service';

// "Morning digest" -- the one notification this platform sends on its own initiative (everything
// else is reactive to another user's action). Once a day, before classes start, every student
// gets a single Web Push summarising the day ahead: their first lecture and how many they have
// today, assignments coming due, and announcements posted overnight. It's the reason to open the
// app first thing in the morning, which is the habit that keeps a student from drifting away.
//
// Discipline rules, on purpose:
//  - only students who enabled phone notifications (>=1 pushSubscription) AND didn't opt out
//    (dailyDigestOptOut) are considered;
//  - a student with genuinely nothing on -- no lecture today, nothing due within DUE_SOON_DAYS,
//    no new announcement -- is skipped, never pinged with an empty summary;
//  - push-only, no in-app notification row: a day summary is worthless once it's stale.
//
// The cron now fires HOURLY; each student is actually pushed only in the hour that matches their
// preferred digest hour (notificationPrefs.digestHour, default 7 local). DIGEST_CRON / DIGEST_TZ
// still override, but only from the real process environment (Render env vars) -- a decorator
// argument is evaluated before ConfigModule reads any .env file, same constraint as multer.config.ts.
const DIGEST_CRON = process.env.DIGEST_CRON || '0 * * * *';
const DIGEST_TZ = process.env.DIGEST_TZ || 'Asia/Damascus';
const DUE_SOON_DAYS = 3;

interface DigestUser {
  id: string;
  name: string;
  department: Department | null;
  academicYear: UserDocument['academicYear'];
  specialization: UserDocument['specialization'];
  streakCount: number;
  lastActiveDate: Date | null;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export interface DigestRunSummary {
  considered: number;
  sent: number;
  skipped: number;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly scheduleService: ScheduleService,
    private readonly assignmentsService: AssignmentsService,
    private readonly announcementsService: AnnouncementsService,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
    private readonly gamificationService: GamificationService,
  ) {}

  // Weekly recap -- one push per active student at the start of the new week (Saturday morning),
  // summarising the week that just ended. Hourly cron, gated to Saturday @ RECAP_HOUR local.
  @Cron('0 * * * *', { name: 'weekly-recap', timeZone: DIGEST_TZ })
  async sendWeeklyRecap(): Promise<DigestRunSummary> {
    if (!this.config.get<string>('push.publicKey') || !this.config.get<string>('push.privateKey')) {
      return { considered: 0, sent: 0, skipped: 0 };
    }
    const RECAP_HOUR = 10;
    const now = new Date();
    const tzOffset = this.config.get<number>('appTzOffsetHours') ?? 3;
    // localDay: shift the UTC day by the offset. getUTCDay 0=Sun..6=Sat.
    const localDay = new Date(now.getTime() + tzOffset * 3_600_000).getUTCDay();
    if (localHour(tzOffset, now) !== RECAP_HOUR || localDay !== 6) {
      return { considered: 0, sent: 0, skipped: 0 };
    }

    const started = Date.now();
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const cursor = this.userModel
      .find({
        role: Role.STUDENT,
        isActive: true,
        dailyDigestOptOut: { $ne: true },
        'pushSubscriptions.0': { $exists: true },
      })
      .select('_id name')
      .batchSize(200)
      .cursor();

    let considered = 0;
    let sent = 0;
    let skipped = 0;
    for await (const doc of cursor) {
      considered += 1;
      try {
        const recap = await this.gamificationService.getWeeklyRecap(doc._id.toString(), 1);
        if (recap.totalPoints <= 0) {
          skipped += 1;
          continue;
        }
        const parts = [`كسبت ${recap.totalPoints} نقطة`, `${recap.activeDays} أيام نشاط`];
        if (recap.assignments > 0) parts.push(`${recap.assignments} واجب`);
        if (recap.quizzes > 0) parts.push(`${recap.quizzes} اختبار`);
        if (recap.deptRank) parts.push(`ترتيبك #${recap.deptRank} في شعبتك`);
        await this.pushService.sendToUser(doc._id.toString(), {
          title: `📊 ملخص أسبوعك — ${doc.name.split(' ')[0] || doc.name}`,
          body: parts.join(' · '),
          url: `${frontendUrl}/home`,
          icon: `${frontendUrl}/icons/icon-192.png`,
          tag: 'weekly-recap',
        });
        sent += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(`Weekly recap failed for ${doc._id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    this.logger.log(`Weekly recap: ${sent} sent, ${skipped} skipped of ${considered} (${Date.now() - started}ms).`);
    return { considered, sent, skipped };
  }

  @Cron(DIGEST_CRON, { name: 'daily-digest', timeZone: DIGEST_TZ })
  async sendDailyDigest(): Promise<DigestRunSummary> {
    if (!this.config.get<string>('push.publicKey') || !this.config.get<string>('push.privateKey')) {
      return { considered: 0, sent: 0, skipped: 0 };
    }

    const started = Date.now();
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const now = new Date();
    const todayDow = now.getDay();
    const tzOffset = this.config.get<number>('appTzOffsetHours') ?? 3;
    const currentLocalHour = localHour(tzOffset, now);

    // Per-run memo so a shared timetable / department isn't re-queried once per student. The
    // timetable is keyed by the full class group; new-announcement counts only by department.
    const scheduleCache = new Map<string, ScheduleEntryDocument[]>();
    const announcementCache = new Map<string, number>();

    const cursor = this.userModel
      .find({
        role: Role.STUDENT,
        isActive: true,
        dailyDigestOptOut: { $ne: true },
        'pushSubscriptions.0': { $exists: true },
      })
      .select('_id name department academicYear specialization streakCount lastActiveDate notificationPrefs')
      .batchSize(200)
      .cursor();

    let considered = 0;
    let sent = 0;
    let skipped = 0;

    for await (const doc of cursor) {
      considered += 1;

      // Send only in the student's preferred hour (default 7 local). The cron fires hourly, so
      // each student still gets exactly one shot per day.
      const targetHour = doc.notificationPrefs?.digestHour ?? DEFAULT_DIGEST_HOUR;
      if (currentLocalHour !== targetHour) {
        skipped += 1;
        continue;
      }
      // Don't nag someone who's already opened the app today -- they've seen what's on. (A student
      // active today is by definition not at streak risk, so nothing is lost.)
      if (doc.lastActiveDate && isSameUtcDay(doc.lastActiveDate, now)) {
        skipped += 1;
        continue;
      }

      const user: DigestUser = {
        id: doc._id.toString(),
        name: doc.name,
        department: doc.department,
        academicYear: doc.academicYear,
        specialization: doc.specialization,
        streakCount: doc.streakCount ?? 0,
        lastActiveDate: doc.lastActiveDate ?? null,
      };
      try {
        const payload = await this.buildDigest(user, todayDow, frontendUrl, scheduleCache, announcementCache);
        if (!payload) {
          skipped += 1;
          continue;
        }
        await this.pushService.sendToUser(user.id, payload);
        sent += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(`Digest failed for user ${user.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(
      `Daily digest: ${sent} sent, ${skipped} skipped of ${considered} eligible (${Date.now() - started}ms).`,
    );
    return { considered, sent, skipped };
  }

  // Fires one student's digest on demand (POST /digest/test) so they can preview it without
  // waiting for the morning cron. Returns false when they'd have been skipped (nothing on today).
  async sendNow(userId: string): Promise<boolean> {
    const doc = await this.userModel
      .findById(userId)
      .select('_id name department academicYear specialization streakCount lastActiveDate')
      .exec();
    if (!doc) return false;

    const user: DigestUser = {
      id: doc._id.toString(),
      name: doc.name,
      department: doc.department,
      academicYear: doc.academicYear,
      specialization: doc.specialization,
      streakCount: doc.streakCount ?? 0,
      lastActiveDate: doc.lastActiveDate ?? null,
    };
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const payload = await this.buildDigest(user, new Date().getDay(), frontendUrl, new Map(), new Map());
    if (!payload) return false;

    await this.pushService.sendToUser(user.id, payload);
    return true;
  }

  private async buildDigest(
    user: DigestUser,
    todayDow: number,
    frontendUrl: string,
    scheduleCache: Map<string, ScheduleEntryDocument[]>,
    announcementCache: Map<string, number>,
  ): Promise<PushPayload | null> {
    const [todayClasses, dueSoon, newAnnouncements] = await Promise.all([
      this.todayClassesFor(user, todayDow, scheduleCache),
      this.dueSoonFor(user.id),
      this.newAnnouncementsCountFor(user.department, announcementCache),
    ]);

    // Streak-at-risk: a running streak that hasn't been extended today. Worth a nudge on its own
    // even when nothing else is on -- keeping the streak alive is the strongest daily-return hook.
    const streakAtRisk =
      user.streakCount > 0 && (!user.lastActiveDate || !isSameUtcDay(user.lastActiveDate, new Date()));

    if (todayClasses.length === 0 && dueSoon.count === 0 && newAnnouncements === 0 && !streakAtRisk) {
      return null;
    }

    const firstName = user.name.split(' ')[0] || user.name;
    const parts: string[] = [];

    if (todayClasses.length > 0) {
      const first = todayClasses[0];
      const where = first.location ? ` (${first.location})` : '';
      parts.push(
        todayClasses.length === 1
          ? `محاضرتك اليوم: ${first.courseName} ${first.startTime}${where}`
          : `أول محاضرة: ${first.courseName} ${first.startTime}${where} · ${todayClasses.length} محاضرات اليوم`,
      );
    } else {
      parts.push('لا محاضرات اليوم');
    }

    if (dueSoon.count > 0) {
      parts.push(
        dueSoon.count === 1
          ? `تسليم قريب: ${dueSoon.soonestTitle}`
          : `${dueSoon.count} تسليمات خلال ${DUE_SOON_DAYS} أيام`,
      );
    }

    if (newAnnouncements > 0) {
      parts.push(newAnnouncements === 1 ? 'إعلان جديد' : `${newAnnouncements} إعلانات جديدة`);
    }

    if (streakAtRisk) {
      parts.push(`🔥 سلسلتك ${user.streakCount} يومًا — سجّل نشاطًا اليوم للحفاظ عليها`);
    }

    return {
      title: `☀️ صباح الخير، ${firstName}`,
      body: parts.join(' · '),
      url: `${frontendUrl}/home`,
      icon: `${frontendUrl}/icons/icon-192.png`,
      tag: 'daily-digest',
    };
  }

  private async todayClassesFor(
    user: DigestUser,
    todayDow: number,
    cache: Map<string, ScheduleEntryDocument[]>,
  ): Promise<ScheduleEntryDocument[]> {
    if (!user.department || !user.academicYear || !user.specialization) return [];

    const key = `${user.department}|${user.academicYear}|${user.specialization}`;
    let entries = cache.get(key);
    if (!entries) {
      entries = await this.scheduleService.findForGroup({
        department: user.department,
        academicYear: user.academicYear,
        specialization: user.specialization,
      });
      cache.set(key, entries);
    }
    return entries
      .filter((entry) => entry.dayOfWeek === todayDow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Global/professor assignments plus this student's personal ones, due within DUE_SOON_DAYS and
  // not yet marked done -- mirrors how DashboardService derives its "due" list.
  private async dueSoonFor(userId: string): Promise<{ count: number; soonestTitle: string | null }> {
    const horizon = new Date(Date.now() + DUE_SOON_DAYS * 86_400_000);
    const uid = new Types.ObjectId(userId);

    const upcoming = await this.assignmentsService.findAll(1, 50, undefined, true, userId);
    const relevant = upcoming
      .filter((a) => a.dueDate <= horizon && !a.completedBy.some((cid) => cid.equals(uid)))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return { count: relevant.length, soonestTitle: relevant[0]?.title ?? null };
  }

  private async newAnnouncementsCountFor(
    department: Department | null,
    cache: Map<string, number>,
  ): Promise<number> {
    const key = department ?? '__all__';
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const since = new Date(Date.now() - 24 * 3_600_000);
    const count = await this.announcementsService.countSince(since, department);
    cache.set(key, count);
    return count;
  }
}
