import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { BADGES, BadgeId, POINTS, REFERRAL_TARGET } from './badges';

export interface GamificationStats {
  totalPointsAwarded: number;
  avgPoints: number;
  avgStreak: number;
  usersWithStreak: number;
  badgeCounts: Record<string, number>;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(prev: Date, today: Date): boolean {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(prev, yesterday);
}

@Injectable()
export class GamificationService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // Called on login. Consecutive-day streak, grandfathering today's repeat logins as a no-op.
  async recordActivity(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) return;

    const now = new Date();
    if (user.lastActiveDate && isSameDay(user.lastActiveDate, now)) {
      return; // already recorded today
    }

    user.streakCount = user.lastActiveDate && isYesterday(user.lastActiveDate, now) ? user.streakCount + 1 : 1;
    user.lastActiveDate = now;
    await user.save();

    if (user.streakCount >= 7) await this.maybeAwardBadge(userId, 'active_streak_7');
  }

  async awardPoints(userId: string, amount: number): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $inc: { points: amount } }).exec();
  }

  // Called once per accepted invite (a new account signed up with `referrerId`'s code).
  // Bumps the running count; the first time it reaches REFERRAL_TARGET the user earns the
  // referral_5 badge plus a one-time points bonus. Using the post-update count with an
  // equality check keeps the bonus one-time even if the count keeps climbing past the target.
  async recordReferral(referrerId: string): Promise<void> {
    const user = await this.userModel
      .findByIdAndUpdate(referrerId, { $inc: { referralCount: 1 } }, { new: true })
      .exec();
    if (!user) return;

    if (user.referralCount === REFERRAL_TARGET && !user.badges.includes('referral_5')) {
      await this.awardPoints(referrerId, POINTS.REFERRAL_MILESTONE);
      await this.maybeAwardBadge(referrerId, 'referral_5');
    }
  }

  async maybeAwardBadge(userId: string, badgeId: BadgeId): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $addToSet: { badges: badgeId } }).exec();
  }

  async getLeaderboard(limit = 20): Promise<UserDocument[]> {
    return this.userModel.find().select('name photoUrl role points streakCount').sort({ points: -1 }).limit(limit).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---

  // Positive or negative -- lets an admin correct a points balance (e.g. after abuse or a bug),
  // same $inc mechanism as awardPoints() but with an admin-chosen delta instead of a fixed reward.
  async adminAdjustPoints(userId: string, delta: number): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, { $inc: { points: delta } }, { new: true }).exec();
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.points < 0) {
      user.points = 0;
      await user.save();
    }
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
