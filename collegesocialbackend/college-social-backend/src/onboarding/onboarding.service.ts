import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { StudyGroup, StudyGroupDocument } from '../groups/schemas/study-group.schema';
import { PointsEvent, PointsEventDocument } from '../gamification/schemas/points-event.schema';

export interface ChecklistItem {
  key: 'set_department' | 'enable_push' | 'add_friend' | 'join_group' | 'first_post';
  done: boolean;
}

export interface OnboardingState {
  completedAt: string | null;
  /** true while the first-week checklist should still be shown on /home. */
  showChecklist: boolean;
  checklist: ChecklistItem[];
  activeDays: number;
  /** The week-1 activation metric: department set + (a friend OR a group) + 3+ active days. */
  activated: boolean;
}

const FIRST_WEEK_MS = 7 * 86_400_000;

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(StudyGroup.name) private readonly groupModel: Model<StudyGroupDocument>,
    @InjectModel(PointsEvent.name) private readonly pointsEventModel: Model<PointsEventDocument>,
  ) {}

  async getState(userId: string): Promise<OnboardingState> {
    const uid = new Types.ObjectId(userId);
    const user = await this.userModel
      .findById(userId)
      .select('department friends pushSubscriptions onboardingCompletedAt createdAt')
      .lean()
      .exec();
    if (!user) {
      return { completedAt: null, showChecklist: false, checklist: [], activeDays: 0, activated: false };
    }

    const [groupCount, firstPost, activeDaysAgg] = await Promise.all([
      this.groupModel.countDocuments({ members: uid }).exec(),
      this.pointsEventModel.exists({ user: uid, reason: 'post_created' }).exec(),
      this.pointsEventModel
        .aggregate<{ n: number }>([
          { $match: { user: uid, reason: 'daily_active' } },
          { $group: { _id: null, n: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const activeDays = activeDaysAgg[0]?.n ?? 0;

    const checklist: ChecklistItem[] = [
      { key: 'set_department', done: !!user.department },
      { key: 'enable_push', done: (user.pushSubscriptions?.length ?? 0) > 0 },
      { key: 'add_friend', done: (user.friends?.length ?? 0) > 0 },
      { key: 'join_group', done: groupCount > 0 },
      { key: 'first_post', done: !!firstPost },
    ];

    const doneCount = checklist.filter((c) => c.done).length;
    // createdAt comes from `timestamps: true` and isn't on the schema class type.
    const createdRaw = (user as { createdAt?: string | Date }).createdAt;
    const createdAt = createdRaw ? new Date(createdRaw).getTime() : 0;
    const withinFirstWeek = createdAt > 0 && Date.now() - createdAt < FIRST_WEEK_MS;
    // Show the checklist for the first week, or until every item is done -- whichever comes first.
    const showChecklist = withinFirstWeek && doneCount < checklist.length;

    const has = (k: ChecklistItem['key']) => checklist.find((c) => c.key === k)?.done ?? false;
    const activated = has('set_department') && (has('add_friend') || has('join_group')) && activeDays >= 3;

    return {
      completedAt: user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt).toISOString() : null,
      showChecklist,
      checklist,
      activeDays,
      activated,
    };
  }

  async markComplete(userId: string): Promise<{ completedAt: string }> {
    const now = new Date();
    await this.userModel
      .updateOne({ _id: userId, onboardingCompletedAt: null }, { $set: { onboardingCompletedAt: now } })
      .exec();
    const user = await this.userModel.findById(userId).select('onboardingCompletedAt').lean().exec();
    return { completedAt: (user?.onboardingCompletedAt ?? now).toISOString() };
  }
}
