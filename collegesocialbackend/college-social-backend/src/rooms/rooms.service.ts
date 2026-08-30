import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StudyRoom, StudyRoomDocument } from './schemas/study-room.schema';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

const PRUNE_IDLE_MS = 60 * 60 * 1000; // empty + untouched for 1h -> deleted on next list()
const MAX_ROOMS_PER_USER = 3;

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
}

export interface RoomDetail extends RoomListItem {
  timer: RoomTimerView;
}

type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(StudyRoom.name) private readonly model: Model<StudyRoomDocument>) {}

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
    // Opportunistic prune of abandoned rooms.
    await this.model
      .deleteMany({ 'members.0': { $exists: false }, lastActiveAt: { $lt: new Date(Date.now() - PRUNE_IDLE_MS) } })
      .exec();

    const docs = await this.model
      .find({ $or: [{ department: null }, { department: user.department ?? null }] })
      .sort({ lastActiveAt: -1 })
      .limit(50)
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

  async create(user: AuthenticatedUser, name: string, topic?: string): Promise<RoomDetail> {
    const trimmed = (name ?? '').trim();
    if (trimmed.length < 2) throw new BadRequestException('اسم الغرفة قصير جدًا');

    const mine = await this.model.countDocuments({ createdBy: new Types.ObjectId(user.userId) });
    if (mine >= MAX_ROOMS_PER_USER) {
      throw new BadRequestException(`يمكنك إنشاء ${MAX_ROOMS_PER_USER} غرف كحد أقصى`);
    }

    const doc = await this.model.create({
      name: trimmed.slice(0, 80),
      topic: (topic ?? '').trim().slice(0, 120),
      createdBy: new Types.ObjectId(user.userId),
      department: user.department ?? null,
      members: [{ user: new Types.ObjectId(user.userId) }],
    });
    await doc.populate('members.user', 'name photoUrl');
    return { ...this.listItem(doc, user.userId), timer: this.timerView(doc) };
  }

  async join(user: AuthenticatedUser, id: string): Promise<RoomDetail> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الغرفة غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الغرفة غير موجودة');
    if (!this.isMember(doc, user.userId)) {
      doc.members.push({ user: new Types.ObjectId(user.userId), joinedAt: new Date() });
    }
    doc.lastActiveAt = new Date();
    await doc.save();
    await doc.populate('members.user', 'name photoUrl');
    if (this.autoAdvance(doc)) await doc.save();
    return { ...this.listItem(doc, user.userId), timer: this.timerView(doc) };
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
