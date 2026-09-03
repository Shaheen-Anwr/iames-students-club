import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StudyRoom, StudyRoomDocument } from './schemas/study-room.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PushService } from '../push/push.service';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const PRUNE_IDLE_MS = 60 * 60 * 1000; // empty + untouched for 1h -> deleted on next list()
const MAX_ROOMS_PER_USER = 3;
const MAX_SCHEDULE_DAYS = 14; // how far ahead a room may be booked
const REMINDER_LEAD_MS = 45 * 60 * 1000; // ping friends this long before a scheduled room starts

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function yesterdayKey(d: Date): string {
  const y = new Date(d);
  y.setUTCDate(y.getUTCDate() - 1);
  return dayKey(y);
}

interface MemberUser {
  _id: Types.ObjectId;
  name?: string;
  photoUrl?: string | null;
}

export interface RoomTimerView {
  phase: 'focus' | 'break';
  running: boolean;
  endsAt: Date | null;
  remainingMs: number | null;
  focusMin: number;
  breakMin: number;
}

export interface RoomListItem {
  _id: string;
  name: string;
  topic: string;
  department: Department | null;
  memberCount: number;
  members: { _id: string; name: string; photoUrl: string | null }[];
  timerPhase: 'focus' | 'break';
  timerRunning: boolean;
  mine: boolean;
  joined: boolean;
  createdAt: Date;
  /** null = ad-hoc/live; a future date = upcoming scheduled session; a past date = it has started. */
  scheduledFor: Date | null;
}

export interface RoomDetail extends RoomListItem {
  timer: RoomTimerView;
}

type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectModel(StudyRoom.name) private readonly model: Model<StudyRoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  private members(doc: StudyRoomDocument) {
    return (doc.members ?? []).map((m) => {
      const u = m.user as unknown as MemberUser | Types.ObjectId;
      if (u && typeof u === 'object' && 'name' in u) {
        return { _id: (u._id as Types.ObjectId).toString(), name: u.name ?? 'مستخدم', photoUrl: u.photoUrl ?? null };
      }
      return { _id: (u as Types.ObjectId).toString(), name: 'عضو', photoUrl: null };
    });
  }

  private isMember(doc: StudyRoomDocument, userId: string): boolean {
    return (doc.members ?? []).some((m) => m.user.toString() === userId);
  }

  private listItem(doc: StudyRoomDocument, userId: string): RoomListItem {
    const members = this.members(doc);
    return {
      _id: doc._id.toString(),
      name: doc.name,
      topic: doc.topic,
      department: doc.department,
      memberCount: members.length,
      members: members.slice(0, 8),
      timerPhase: doc.timer.phase,
      timerRunning: doc.timer.running,
      mine: doc.createdBy.toString() === userId,
      joined: this.isMember(doc, userId),
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
      scheduledFor: doc.scheduledFor ?? null,
    };
  }

  private timerView(doc: StudyRoomDocument): RoomTimerView {
    const t = doc.timer;
    let remainingMs: number | null = null;
    if (t.running && t.endsAt) remainingMs = Math.max(0, t.endsAt.getTime() - Date.now());
    else if (t.pausedRemainingMs != null) remainingMs = t.pausedRemainingMs;
    return {
      phase: t.phase,
      running: t.running,
      endsAt: t.endsAt,
      remainingMs,
      focusMin: t.focusMin,
      breakMin: t.breakMin,
    };
  }

  // A running phase whose endsAt has passed is auto-advanced to the other phase (stopped), so a
  // late poller / new joiner sees the room "ring" and waiting for someone to start the next phase.
  private autoAdvance(doc: StudyRoomDocument): boolean {
    const t = doc.timer;
    if (t.running && t.endsAt && t.endsAt.getTime() <= Date.now()) {
      t.phase = t.phase === 'focus' ? 'break' : 'focus';
      t.running = false;
      t.endsAt = null;
      t.pausedRemainingMs = null;
      return true;
    }
    return false;
  }

  async list(user: AuthenticatedUser): Promise<RoomListItem[]> {
    // Opportunistic prune: abandoned ad-hoc rooms, and scheduled rooms whose slot passed 3h+ ago
    // with nobody but the host.
    await Promise.all([
      this.model
        .deleteMany({ 'members.0': { $exists: false }, lastActiveAt: { $lt: new Date(Date.now() - PRUNE_IDLE_MS) } })
        .exec(),
      this.model
        .deleteMany({
          scheduledFor: { $lt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
          'members.1': { $exists: false },
        })
        .exec(),
    ]);

    const docs = await this.model
      .find({ $or: [{ department: null }, { department: user.department ?? null }] })
      .sort({ lastActiveAt: -1 })
      .limit(60)
      .populate('members.user', 'name photoUrl')
      .exec();

    return docs.map((d) => this.listItem(d, user.userId));
  }

  async get(user: AuthenticatedUser, id: string): Promise<RoomDetail> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).populate('members.user', 'name photoUrl').exec();
    if (!doc) throw new NotFoundException('الغرفة غير موجودة');
    if (this.autoAdvance(doc)) await doc.save();
    return { ...this.listItem(doc, user.userId), timer: this.timerView(doc) };
  }

  async create(
    user: AuthenticatedUser,
    name: string,
    topic?: string,
    scheduledForRaw?: string | Date | null,
  ): Promise<RoomDetail> {
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 2) throw new BadRequestException('اسم الغرفة قصير جدًا');

    const mine = await this.model.countDocuments({ createdBy: new Types.ObjectId(user.userId) });
    if (mine >= MAX_ROOMS_PER_USER) {
      throw new BadRequestException(`يمكنك إنشاء ${MAX_ROOMS_PER_USER} غرف كحد أقصى`);
    }

    let scheduledFor: Date | null = null;
    if (scheduledForRaw) {
      const d = new Date(scheduledForRaw);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('موعد غير صالح');
      if (d.getTime() < Date.now() - 60_000) throw new BadRequestException('لا يمكن جدولة غرفة في الماضي');
      if (d.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) {
        throw new BadRequestException(`لا يمكن الجدولة لأبعد من ${MAX_SCHEDULE_DAYS} يومًا`);
      }
      scheduledFor = d;
    }

    const doc = await this.model.create({
      name: trimmed.slice(0, 80),
      topic: (topic ?? '').trim().slice(0, 120),
      createdBy: new Types.ObjectId(user.userId),
      department: user.department ?? null,
      members: [{ user: new Types.ObjectId(user.userId) }],
      scheduledFor,
    });
    await doc.populate('members.user', 'name photoUrl');
    return { ...this.listItem(doc, user.userId), timer: this.timerView(doc) };
  }

  async join(user: AuthenticatedUser, id: string): Promise<RoomDetail> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الغرفة غير موجودة');
    const wasMember = this.isMember(doc, user.userId);
    if (!wasMember) {
      doc.members.push({ user: new Types.ObjectId(user.userId), joinedAt: new Date() });
    }
    doc.lastActiveAt = new Date();
    await doc.save();
    await doc.populate('members.user', 'name photoUrl');
    if (this.autoAdvance(doc)) await doc.save();

    if (!wasMember) {
      // Best-effort side effects -- never let them fail the join.
      void this.bumpRoomStreak(user.userId).catch(() => undefined);
      const live = !doc.scheduledFor || doc.scheduledFor.getTime() <= Date.now();
      if (live) void this.pingFriends(doc, user.userId).catch(() => undefined);
    }

    return { ...this.listItem(doc, user.userId), timer: this.timerView(doc) };
  }

  // Consecutive-day streak of joining at least one study room. Bumped once per UTC day.
  private async bumpRoomStreak(userId: string): Promise<void> {
    const u = await this.userModel.findById(userId).select('roomStreak roomStreakLastDay').exec();
    if (!u) return;
    const today = dayKey(new Date());
    if (u.roomStreakLastDay === today) return;
    u.roomStreak = u.roomStreakLastDay === yesterdayKey(new Date()) ? (u.roomStreak ?? 0) + 1 : 1;
    u.roomStreakLastDay = today;
    await u.save();
  }

  // Push the joiner's شعبة friends (not already in the room, not already pinged for it) so they
  // can jump in. Push-only, no in-app row -- a "studying now" nudge is worthless once stale.
  private async pingFriends(doc: StudyRoomDocument, joinerId: string): Promise<void> {
    const joiner = await this.userModel.findById(joinerId).select('name friends department').lean().exec();
    if (!joiner || (joiner.friends?.length ?? 0) === 0) return;

    const memberIds = new Set((doc.members ?? []).map((m) => m.user.toString()));
    const alreadyPinged = new Set((doc.notifiedUserIds ?? []).map((x) => x.toString()));
    const targets = (joiner.friends ?? [])
      .map((f) => f.toString())
      .filter((f) => !memberIds.has(f) && !alreadyPinged.has(f));
    if (targets.length === 0) return;

    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    const first = joiner.name?.split(' ')[0] || joiner.name || 'صديقك';
    await this.pushService.sendToUsers(targets, {
      title: `📚 ${first} يذاكر الآن`,
      body: `في غرفة "${doc.name}" — انضم إليه`,
      url: `${frontendUrl}/rooms/${doc._id.toString()}`,
      icon: `${frontendUrl}/icons/icon-192.png`,
      tag: `room-${doc._id.toString()}`,
    });
    await this.model
      .updateOne({ _id: doc._id }, { $addToSet: { notifiedUserIds: { $each: targets.map((t) => new Types.ObjectId(t)) } } })
      .exec();
  }

  async getMyRoomStreak(userId: string): Promise<{ roomStreak: number }> {
    const u = await this.userModel.findById(userId).select('roomStreak roomStreakLastDay').lean().exec();
    const now = new Date();
    const fresh = u?.roomStreakLastDay === dayKey(now) || u?.roomStreakLastDay === yesterdayKey(now);
    return { roomStreak: fresh ? u?.roomStreak ?? 0 : 0 };
  }

  // Hourly (+30): push each imminent scheduled room's host + شعبة friends so a booked session
  // actually fills. Stamps reminderSentAt so it fires once.
  @Cron('0,30 * * * *', { name: 'room-scheduled-reminders' })
  async sendScheduledReminders(): Promise<{ rooms: number; pushed: number }> {
    if (!this.config.get<string>('push.publicKey') || !this.config.get<string>('push.privateKey')) {
      return { rooms: 0, pushed: 0 };
    }
    const now = Date.now();
    const due = await this.model
      .find({ reminderSentAt: null, scheduledFor: { $gte: new Date(now), $lte: new Date(now + REMINDER_LEAD_MS) } })
      .limit(100)
      .exec();

    let pushed = 0;
    const frontendUrl = this.config.get<string>('frontendUrl') ?? '';
    for (const room of due) {
      try {
        const host = await this.userModel.findById(room.createdBy).select('name friends').lean().exec();
        const targets = (host?.friends ?? []).map((f) => f.toString());
        if (targets.length > 0) {
          await this.pushService.sendToUsers(targets, {
            title: `⏰ غرفة "${room.name}" تبدأ قريبًا`,
            body: `${host?.name?.split(' ')[0] ?? 'زميلك'} جدول جلسة مذاكرة — كن مستعدًا`,
            url: `${frontendUrl}/rooms/${room._id.toString()}`,
            icon: `${frontendUrl}/icons/icon-192.png`,
            tag: `room-sched-${room._id.toString()}`,
          });
          pushed += targets.length;
        }
      } catch (err) {
        this.logger.warn(`scheduled-room reminder failed for ${room._id}: ${err instanceof Error ? err.message : err}`);
      }
      room.reminderSentAt = new Date();
      await room.save();
    }
    if (due.length) this.logger.log(`Scheduled-room reminders: ${due.length} room(s), ${pushed} push(es).`);
    return { rooms: due.length, pushed };
  }

  // Leaving the last spot deletes the room.
  async leave(user: AuthenticatedUser, id: string): Promise<{ left: true; deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) return { left: true, deleted: true };
    doc.members = doc.members.filter((m) => m.user.toString() !== user.userId);
    if (doc.members.length === 0) {
      await doc.deleteOne();
      return { left: true, deleted: true };
    }
    doc.lastActiveAt = new Date();
    await doc.save();
    return { left: true, deleted: false };
  }

  async setTimer(
    user: AuthenticatedUser,
    id: string,
    action: TimerAction,
    opts: { focusMin?: number; breakMin?: number } = {},
  ): Promise<RoomTimerView> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الغرفة غير موجودة');
    if (!this.isMember(doc, user.userId)) throw new ForbiddenException('انضم للغرفة أولًا');

    const t = doc.timer;
    if (opts.focusMin && opts.focusMin >= 5 && opts.focusMin <= 90) t.focusMin = Math.round(opts.focusMin);
    if (opts.breakMin && opts.breakMin >= 1 && opts.breakMin <= 30) t.breakMin = Math.round(opts.breakMin);
    const phaseMs = (t.phase === 'focus' ? t.focusMin : t.breakMin) * 60_000;

    switch (action) {
      case 'start':
        if (!t.running) {
          const ms = t.pausedRemainingMs ?? phaseMs;
          t.endsAt = new Date(Date.now() + ms);
          t.running = true;
          t.pausedRemainingMs = null;
        }
        break;
      case 'pause':
        if (t.running && t.endsAt) {
          t.pausedRemainingMs = Math.max(0, t.endsAt.getTime() - Date.now());
          t.running = false;
          t.endsAt = null;
        }
        break;
      case 'reset':
        t.running = false;
        t.endsAt = null;
        t.pausedRemainingMs = null;
        t.phase = 'focus';
        break;
      case 'skip':
        t.phase = t.phase === 'focus' ? 'break' : 'focus';
        t.running = false;
        t.endsAt = null;
        t.pausedRemainingMs = null;
        break;
    }

    doc.lastActiveAt = new Date();
    await doc.save();
    return this.timerView(doc);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الغرفة غير موجودة');
    if (doc.createdBy.toString() !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('لا تملك صلاحية حذف هذه الغرفة');
    }
    await doc.deleteOne();
  }
}
