import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Department } from '../common/enums/department.enum';
import { BADGES, BadgeId, POINTS, REFERRAL_TARGET } from './badges';
import { PointsEvent, PointsEventDocument, PointsReason } from './schemas/points-event.schema';

export interface GamificationStats {
  totalPointsAwarded: number;
  avgPoints: number;
  avgStreak: number;
  usersWithStreak: number;
  badgeCounts: Record<string, number>;
}

export interface MySummary {
  points: number;
  weeklyPoints: number;
  streakCount: number;
  streakFreezes: number;
  /** createdAt of the most recent auto-consumed freeze, if within the last 3 days -- the client
   *  shows a one-time "we saved your streak" toast when this value is newer than what it last saw. */
  lastFreezeUsedAt: string | null;
}

export interface WeeklyRecap {
  /** ISO date of the recapped week's start (Saturday). */
  weekStart: string;
  totalPoints: number;
  activeDays: number;
  posts: number;
  comments: number;
  reactions: number;
  quizzes: number;
  assignments: number;
  streakCount: number;
  freezesUsed: number;
  /** Rank in the شعبة weekly board for that week, or null if unranked / no dept. */
  deptRank: number | null;
}

export interface WeeklyLeaderRow {
  _id: Types.ObjectId;
  name: string;
  photoUrl: string | null;
  role: string;
  department: Department | null;
  streakCount: number;
  /** Points earned this week only. Named `points` too so the existing row renderer works as-is. */
  points: number;
  weeklyPoints: number;
}

// Cap on stockpiled streak freezes -- one is granted per active week, but they don't pile up
// forever (that would defeat the "keep showing up" nudge).
const STREAK_FREEZE_CAP = 2;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole calendar days from a -> b (a=b -> 0, a=yesterday -> 1). */
function calendarDaysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86_400_000);
}

// Weeks start Saturday (regional convention). Server clock is UTC on Render; a few hours' skew
// from Damascus is immaterial for a weekly leaderboard window.
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // getDay: 0=Sun..6=Sat
  return d;
}
function weekKey(now: Date): string {
  const s = startOfWeek(now);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}

/** [start, end) of the week `weeksAgo` before the current one (0 = this week, 1 = last week). */
function weekWindow(weeksAgo: number, now = new Date()): { start: Date; end: Date } {
  const end = startOfWeek(now);
  end.setDate(end.getDate() - 7 * (weeksAgo - 1));
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

// Ledger reason -> which recap counter it feeds.
const RECAP_BUCKET: Record<string, keyof Pick<WeeklyRecap, 'posts' | 'comments' | 'reactions' | 'quizzes' | 'assignments'>> = {
  post_created: 'posts',
  reel_created: 'posts',
  comment_added: 'comments',
  reply_added: 'comments',
  reaction_given: 'reactions',
  quiz_attempted: 'quizzes',
  assignment_completed: 'assignments',
};

@Injectable()
export class GamificationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PointsEvent.name) private pointsEventModel: Model<PointsEventDocument>,
  ) {}

  // Called on login/register and (fire-and-forget) on every token refresh, so a streak advances
  // with real daily use, not only explicit sign-ins. No-ops for a repeat visit the same day.
  async recordActivity(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) return;

    const now = new Date();
    if (user.lastActiveDate && isSameDay(user.lastActiveDate, now)) return;

    // Grant the weekly free freeze -- idempotent per week via the stored week key.
    const wk = weekKey(now);
    if (user.streakFreezeWeekKey !== wk) {
      user.streakFreezes = Math.min((user.streakFreezes ?? 0) + 1, STREAK_FREEZE_CAP);
      user.streakFreezeWeekKey = wk;
    }

    let freezeUsed = false;
    if (!user.lastActiveDate) {
      user.streakCount = 1;
    } else {
      const gap = calendarDaysBetween(user.lastActiveDate, now);
      if (gap === 1) {
        user.streakCount += 1;
      } else if (gap === 2 && (user.streakFreezes ?? 0) > 0) {
        // Exactly one day missed and a freeze available -> spend it, keep the streak alive.
        user.streakFreezes -= 1;
        user.streakCount += 1;
        freezeUsed = true;
      } else {
        user.streakCount = 1;
      }
    }
    user.lastActiveDate = now;
    await user.save();

    if (freezeUsed) {
      void this.logPointsEvent(userId, 0, 'streak_freeze_used', { streak: user.streakCount });
    }
    void this.awardPoints(userId, POINTS.DAILY_LOGIN, 'daily_active');

    if (user.streakCount >= 7) await this.maybeAwardBadge(userId, 'active_streak_7');
  }

  private async logPointsEvent(
    userId: string,
    delta: number,
    reason: PointsReason,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.pointsEventModel
      .create({ user: new Types.ObjectId(userId), delta, reason, meta: meta ?? null })
      .catch(() => undefined);
  }

  // Bumps the denormalised lifetime total AND appends a ledger row. The ledger write is
  // best-effort: a hiccup there must never break the post/comment/quiz flow that awarded the points.
  async awardPoints(
    userId: string,
    amount: number,
    reason: PointsReason = 'other',
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $inc: { points: amount } }).exec();
    await this.logPointsEvent(userId, amount, reason, meta);
  }

  async recordReferral(referrerId: string): Promise<void> {
    const user = await this.userModel
      .findByIdAndUpdate(referrerId, { $inc: { referralCount: 1 } }, { new: true })
      .exec();
    if (!user) return;

    if (user.referralCount === REFERRAL_TARGET && !user.badges.includes('referral_5')) {
      await this.awardPoints(referrerId, POINTS.REFERRAL_MILESTONE, 'referral_milestone');
      await this.maybeAwardBadge(referrerId, 'referral_5');
    }
  }

  async maybeAwardBadge(userId: string, badgeId: BadgeId): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $addToSet: { badges: badgeId } }).exec();
  }

  // --- Reads ---

  async getMySummary(userId: string): Promise<MySummary> {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const [user, weeklyPoints, lastFreeze] = await Promise.all([
      this.userModel.findById(userId).select('points streakCount streakFreezes').lean().exec(),
      this.getWeeklyPoints(userId),
      this.pointsEventModel
        .findOne({ user: new Types.ObjectId(userId), reason: 'streak_freeze_used', createdAt: { $gte: threeDaysAgo } })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean()
        .exec(),
    ]);
    return {
      points: user?.points ?? 0,
      weeklyPoints,
      streakCount: user?.streakCount ?? 0,
      streakFreezes: user?.streakFreezes ?? 0,
      lastFreezeUsedAt: lastFreeze?.createdAt ? new Date(lastFreeze.createdAt).toISOString() : null,
    };
  }

  // A student's recap of the week `weeksAgo` back (default: last week). Drives the weekly-recap
  // push and the home "أسبوعك" card. Everything but streakCount/deptRank comes from the ledger.
  async getWeeklyRecap(userId: string, weeksAgo = 1): Promise<WeeklyRecap> {
    const { start, end } = weekWindow(weeksAgo);
    const uid = new Types.ObjectId(userId);

    const [byReason, user] = await Promise.all([
      this.pointsEventModel
        .aggregate<{ _id: string; total: number; count: number }>([
          { $match: { user: uid, createdAt: { $gte: start, $lt: end } } },
          { $group: { _id: '$reason', total: { $sum: '$delta' }, count: { $sum: 1 } } },
        ])
        .exec(),
      this.userModel.findById(userId).select('streakCount department').lean().exec(),
    ]);

    const recap: WeeklyRecap = {
      weekStart: start.toISOString(),
      totalPoints: 0,
      activeDays: 0,
      posts: 0,
      comments: 0,
      reactions: 0,
      quizzes: 0,
      assignments: 0,
      streakCount: user?.streakCount ?? 0,
      freezesUsed: 0,
      deptRank: null,
    };
    for (const row of byReason) {
      recap.totalPoints += row.total;
      if (row._id === 'daily_active') recap.activeDays = row.count;
      else if (row._id === 'streak_freeze_used') recap.freezesUsed = row.count;
      const bucket = RECAP_BUCKET[row._id];
      if (bucket) recap[bucket] += row.count;
    }

    if (user?.department && recap.totalPoints > 0) {
      const board = await this.pointsEventModel
        .aggregate<{ _id: Types.ObjectId }>([
          { $match: { createdAt: { $gte: start, $lt: end } } },
          { $group: { _id: '$user', pts: { $sum: '$delta' } } },
          { $match: { pts: { $gt: 0 } } },
          { $sort: { pts: -1 } },
          { $limit: 300 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
          { $unwind: '$u' },
          { $match: { 'u.department': user.department } },
          { $project: { _id: 1 } },
        ])
        .exec();
      const idx = board.findIndex((r) => r._id.equals(uid));
      recap.deptRank = idx >= 0 ? idx + 1 : null;
    }

    return recap;
  }

  async getWeeklyPoints(userId: string): Promise<number> {
    const rows = await this.pointsEventModel
      .aggregate<{ total: number }>([
        { $match: { user: new Types.ObjectId(userId), createdAt: { $gte: startOfWeek(new Date()) } } },
        { $group: { _id: null, total: { $sum: '$delta' } } },
      ])
      .exec();
    return rows[0]?.total ?? 0;
  }

  // All-time board -- reads the denormalised `points` total for O(1) per row.
  async getLeaderboard(limit = 20, department?: Department | null): Promise<UserDocument[]> {
    const filter = department ? { department } : {};
    return this.userModel
      .find(filter)
      .select('name photoUrl role points streakCount department')
      .sort({ points: -1 })
      .limit(limit)
      .exec();
  }

  // This-week board -- sums the ledger over the current week window (so it "resets" simply by the
  // window moving, no cron). `points` on each row IS the weekly total, so the client renders it
  // with the same row component as the all-time board.
  async getWeeklyLeaderboard(limit = 20, department?: Department | null): Promise<WeeklyLeaderRow[]> {
    const since = startOfWeek(new Date());
    const rows = await this.pointsEventModel
      .aggregate<WeeklyLeaderRow>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$user', weeklyPoints: { $sum: '$delta' } } },
        { $match: { weeklyPoints: { $gt: 0 } } },
        { $sort: { weeklyPoints: -1 } },
        // Over-fetch before the department filter (applied post-lookup) so it can still return
        // `limit` rows for a شعبة.
        { $limit: department ? limit * 5 : limit },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        ...(department ? [{ $match: { 'u.department': department } }] : []),
        { $limit: limit },
        {
          $project: {
            _id: '$u._id',
            name: '$u.name',
            photoUrl: '$u.photoUrl',
            role: '$u.role',
            department: '$u.department',
            streakCount: '$u.streakCount',
            weeklyPoints: 1,
            points: '$weeklyPoints',
          },
        },
      ])
      .exec();
    return rows;
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async adminAdjustPoints(userId: string, delta: number, adminId?: string): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, { $inc: { points: delta } }, { new: true }).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.points < 0) {
      user.points = 0;
      await user.save();
    }
    await this.logPointsEvent(userId, delta, 'admin_adjust', adminId ? { adminId } : undefined);
    return user;
  }

  async adminGrantBadge(userId: string, badgeId: BadgeId): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, { $addToSet: { badges: badgeId } }, { new: true }).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async adminRevokeBadge(userId: string, badgeId: BadgeId): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, { $pull: { badges: badgeId } }, { new: true }).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async getStats(): Promise<GamificationStats> {
    const [pointsAgg, streakAgg, badgeRows] = await Promise.all([
      this.userModel
        .aggregate<{ total: number; avg: number }>([
          { $group: { _id: null, total: { $sum: '$points' }, avg: { $avg: '$points' } } },
        ])
        .exec(),
      this.userModel
        .aggregate<{ avgStreak: number; usersWithStreak: number }>([
          {
            $group: {
              _id: null,
              avgStreak: { $avg: '$streakCount' },
              usersWithStreak: { $sum: { $cond: [{ $gt: ['$streakCount', 0] }, 1, 0] } },
            },
          },
        ])
        .exec(),
      this.userModel
        .aggregate<{ _id: string; count: number }>([{ $unwind: '$badges' }, { $group: { _id: '$badges', count: { $sum: 1 } } }])
        .exec(),
    ]);
    const badgeCounts: Record<string, number> = Object.fromEntries(Object.keys(BADGES).map((id) => [id, 0]));
    badgeRows.forEach((r) => {
      badgeCounts[r._id] = r.count;
    });
    return {
      totalPointsAwarded: pointsAgg[0]?.total ?? 0,
      avgPoints: Math.round((pointsAgg[0]?.avg ?? 0) * 10) / 10,
      avgStreak: Math.round((streakAgg[0]?.avgStreak ?? 0) * 10) / 10,
      usersWithStreak: streakAgg[0]?.usersWithStreak ?? 0,
      badgeCounts,
    };
  }
}
