import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService, PaginatedUsers, UserStats } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PostsService, PaginatedPosts, PostStats } from '../posts/posts.service';
import { GroupsService, GroupStats } from '../groups/groups.service';
import { QuizzesService, QuizStats } from '../quizzes/quizzes.service';
import { AssignmentsService, AssignmentStats } from '../assignments/assignments.service';
import { AnnouncementsService, AnnouncementStats } from '../announcements/announcements.service';
import { GamificationService, GamificationStats } from '../gamification/gamification.service';
import { QaService, QaStats } from '../qa/qa.service';
import { ChatService, ChatStats } from '../chat/chat.service';
import { AiConversationsService, AiConversationStats } from '../ai/ai-conversations.service';
import { LectureIndexService, LectureIndexStats } from '../ai/lecture-index.service';
import { ScheduleService, ScheduleStats } from '../schedule/schedule.service';
import { PlannerService, PlannerStats } from '../planner/planner.service';
import { NotificationsService, NotificationStats } from '../notifications/notifications.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { TrendSeries } from '../common/utils/daily-counts.util';

const SALT_ROUNDS = 10;

// Selectable windows for GET /api/admin/trends -- clamped server-side so an arbitrary ?range=
// can't drive an unbounded aggregation.
const ALLOWED_TREND_RANGES: readonly number[] = [7, 14, 30, 90];
const DEFAULT_TREND_RANGE = 14;

export function clampTrendRange(raw?: string): number {
  const n = Number(raw);
  return ALLOWED_TREND_RANGES.includes(n) ? n : DEFAULT_TREND_RANGE;
}

export interface AdminTrends {
  range: number;
  signups: TrendSeries;
  posts: TrendSeries;
  comments: TrendSeries;
  quizAttempts: TrendSeries;
  chatMessages: TrendSeries;
  aiMessages: TrendSeries;
}

export interface AdminOverviewStats {
  users: UserStats;
  posts: PostStats;
  groups: GroupStats;
  quizzes: QuizStats;
  assignments: AssignmentStats;
  announcements: AnnouncementStats;
  gamification: GamificationStats;
  qa: QaStats;
  chat: ChatStats;
  ai: AiConversationStats & { lectureIndex: LectureIndexStats };
  schedule: ScheduleStats;
  planner: PlannerStats;
  notifications: NotificationStats;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly postsService: PostsService,
    private readonly groupsService: GroupsService,
    private readonly quizzesService: QuizzesService,
    private readonly assignmentsService: AssignmentsService,
    private readonly announcementsService: AnnouncementsService,
    private readonly gamificationService: GamificationService,
    private readonly qaService: QaService,
    private readonly chatService: ChatService,
    private readonly aiConversationsService: AiConversationsService,
    private readonly lectureIndexService: LectureIndexService,
    private readonly scheduleService: ScheduleService,
    private readonly plannerService: PlannerService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async listUsers(page: number, limit: number, search?: string, verified?: boolean): Promise<PaginatedUsers> {
    return this.usersService.findAllPaginated(page, limit, search, verified);
  }

  async verifyEmail(id: string): Promise<UserDocument> {
    return this.usersService.setEmailVerified(id);
  }

  async listPosts(page: number, limit: number, search?: string): Promise<PaginatedPosts> {
    return this.postsService.adminListPosts(page, limit, search);
  }

  async removePost(id: string): Promise<void> {
    await this.postsService.adminRemovePost(id);
    this.realtimeEmitter.emitToAdmins('admin:activity', {
      type: 'moderation',
      summary: 'قام مدير بحذف منشور',
      at: new Date(),
    });
  }

  async getStats(): Promise<AdminOverviewStats> {
    const [
      users,
      posts,
      groups,
      quizzes,
      assignments,
      announcements,
      gamification,
      qa,
      chat,
      aiConversations,
      lectureIndex,
      schedule,
      planner,
      notifications,
    ] = await Promise.all([
      this.usersService.getStats(),
      this.postsService.getStats(),
      this.groupsService.getStats(),
      this.quizzesService.getStats(),
      this.assignmentsService.getStats(),
      this.announcementsService.getStats(),
      this.gamificationService.getStats(),
      this.qaService.getStats(),
      this.chatService.getStats(),
      this.aiConversationsService.getStats(),
      this.lectureIndexService.getStats(),
      this.scheduleService.getStats(),
      this.plannerService.getStats(),
      this.notificationsService.getStats(),
    ]);
    return {
      users,
      posts,
      groups,
      quizzes,
      assignments,
      announcements,
      gamification,
      qa,
      chat,
      ai: { ...aiConversations, lectureIndex },
      schedule,
      planner,
      notifications,
    };
  }

  // Period-over-period activity trends for the admin console dashboard. Separate from getStats()
  // (which stays range-fixed) so the range control can refetch just this, cheaply.
  async getTrends(days: number): Promise<AdminTrends> {
    const [signups, posts, comments, quizAttempts, chatMessages, aiMessages] = await Promise.all([
      this.usersService.getSignupTrend(days),
      this.postsService.getPostTrend(days),
      this.postsService.getCommentTrend(days),
      this.quizzesService.getAttemptTrend(days),
      this.chatService.getMessageTrend(days),
      this.aiConversationsService.getMessageTrend(days),
    ]);
    return { range: days, signups, posts, comments, quizAttempts, chatMessages, aiMessages };
  }

  async updateRole(id: string, role: Role, actor: AuthenticatedUser): Promise<UserDocument> {
    if (id === actor.userId && role !== Role.ADMIN) {
      throw new BadRequestException('لا يمكنك إزالة صلاحية المدير عن نفسك');
    }
    if (role !== Role.ADMIN) {
      await this.assertNotLastAdmin(id);
      await this.assertNotLastSuperAdmin(id);
      // A super admin can't outrank an admin -- demoting past 'admin' clears the flag too.
      const target = await this.usersService.findById(id);
      if (target.isSuperAdmin) {
        await this.usersService.updateSuperAdmin(id, false);
      }
    }
    return this.usersService.updateRole(id, role);
  }

  async updateSuperAdmin(id: string, isSuperAdmin: boolean, actor: AuthenticatedUser): Promise<UserDocument> {
    if (id === actor.userId && !isSuperAdmin) {
      throw new BadRequestException('لا يمكنك إزالة صلاحية المدير العام عن نفسك');
    }
    if (!isSuperAdmin) {
      await this.assertNotLastSuperAdmin(id);
    } else {
      // A super admin is always an admin -- auto-promote on grant so the flag can't sit on a
      // student/professor account.
      const target = await this.usersService.findById(id);
      if (target.role !== Role.ADMIN) {
        await this.usersService.updateRole(id, Role.ADMIN);
      }
    }
    return this.usersService.updateSuperAdmin(id, isSuperAdmin);
  }

  async updateActive(id: string, isActive: boolean, actor: AuthenticatedUser): Promise<UserDocument> {
    if (id === actor.userId && !isActive) {
      throw new BadRequestException('لا يمكنك إيقاف حسابك الخاص');
    }
    if (!isActive) {
      await this.assertNotLastAdmin(id);
    }
    return this.usersService.updateActive(id, isActive);
  }

  async setPassword(id: string, password: string): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    return this.usersService.updatePasswordHash(id, passwordHash);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    if (id === actor.userId) {
      throw new BadRequestException('لا يمكنك حذف حسابك الخاص');
    }
    await this.assertNotLastAdmin(id);
    await this.assertNotLastSuperAdmin(id);
    await this.usersService.remove(id);
    this.realtimeEmitter.emitToAdmins('admin:activity', {
      type: 'moderation',
      summary: 'قام مدير بحذف حساب مستخدم',
      at: new Date(),
    });
  }

  // Guards against locking everyone out by demoting/deactivating/deleting the only admin.
  private async assertNotLastAdmin(targetId: string): Promise<void> {
    const target = await this.usersService.findById(targetId);
    if (target.role !== Role.ADMIN) return;

    const adminCount = await this.usersService.countAdmins();
    if (adminCount <= 1) {
      throw new BadRequestException('لا يمكن إزالة آخر مدير متبقٍ');
    }
  }

  // Guards against locking every user-management action out by demoting/deleting/revoking the only
  // super admin -- nobody left could ever reach AdminController again.
  private async assertNotLastSuperAdmin(targetId: string): Promise<void> {
    const target = await this.usersService.findById(targetId);
    if (!target.isSuperAdmin) return;

    const superAdminCount = await this.usersService.countSuperAdmins();
    if (superAdminCount <= 1) {
      throw new BadRequestException('لا يمكن إزالة آخر مدير عام متبقٍ');
    }
  }
}
