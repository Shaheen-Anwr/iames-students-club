import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { CacheService } from '../common/cache/cache.service';
import { ScheduleService } from '../schedule/schedule.service';
import { PlannerService } from '../planner/planner.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { GamificationService } from '../gamification/gamification.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { GpaService } from '../gpa/gpa.service';
import { AttendanceService } from '../attendance/attendance.service';
import { PostsService } from '../posts/posts.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationType } from '../notifications/schemas/notification.schema';
import { ScheduleEntryDocument } from '../schedule/schemas/schedule-entry.schema';
import { AnnouncementDocument } from '../announcements/schemas/announcement.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { urgencyOf, Urgency } from '../common/utils/urgency.util';
import { Role } from '../common/enums/role.enum';

export interface DueItem {
  type: 'assignment' | 'planner';
  id: string;
  title: string;
  courseCode: string | null;
  dueDate: Date;
  urgency: Urgency;
}

export interface DashboardResponse {
  todaySchedule: ScheduleEntryDocument[];
  dueToday: DueItem[];
  leaderboard: UserDocument[];
  announcements: AnnouncementDocument[];
}

export interface SinceLastSeen {
  since: string;
  newLectures: number;
  newAnnouncements: number;
  repliesToYou: number;
  /** True when there's nothing worth surfacing (all zero) or `since` was missing/too old. */
  empty: boolean;
}

// Notification types that count as "someone responded to you" for the away-recap strip.
const REPLY_TYPES: NotificationType[] = [
  'post_comment',
  'comment_reply',
  'comment_reaction',
  'post_reaction',
  'mention',
  'qa_answer',
  'reel_comment',
  'reel_comment_reply',
  'reel_mention',
];

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, urgent: 1, normal: 2, completed: 3 };

@Injectable()
export class DashboardService {
  constructor(
    private readonly cache: CacheService,
    private readonly scheduleService: ScheduleService,
    private readonly plannerService: PlannerService,
    private readonly assignmentsService: AssignmentsService,
    private readonly gamificationService: GamificationService,
    private readonly announcementsService: AnnouncementsService,
    private readonly gpaService: GpaService,
    private readonly attendanceService: AttendanceService,
    private readonly postsService: PostsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // "Since you were away" strip on /home. `since` is the client's own last-home-visit timestamp
  // (per device, from localStorage). Anything missing, in the future, or older than 14 days is
  // treated as "no baseline" -> empty, so a returning-after-weeks student doesn't get a wall of
  // counts.
  async getSinceLastSeen(user: AuthenticatedUser, sinceIso?: string): Promise<SinceLastSeen> {
    const now = Date.now();
    const parsed = sinceIso ? Date.parse(sinceIso) : NaN;
    const tooOld = now - 14 * 86_400_000;
    if (Number.isNaN(parsed) || parsed > now || parsed < tooOld) {
      return { since: new Date().toISOString(), newLectures: 0, newAnnouncements: 0, repliesToYou: 0, empty: true };
    }
    const since = new Date(parsed);

    const schedule = await this.scheduleService.findForUser(user.userId);
    const courseCodes = [...new Set(schedule.map((s) => s.courseName).filter(Boolean))];

    const [newLectures, newAnnouncements, repliesToYou] = await Promise.all([
      this.postsService.countLecturesSince(courseCodes, since, user.department),
      this.announcementsService.countSince(since, user.department),
      this.notificationsService.countUnreadSince(user.userId, REPLY_TYPES, since),
    ]);

    return {
      since: since.toISOString(),
      newLectures,
      newAnnouncements,
      repliesToYou,
      empty: newLectures + newAnnouncements + repliesToYou === 0,
    };
  }

  getDashboard(user: AuthenticatedUser): Promise<DashboardResponse> {
    // 10s per-user cache: pull-to-refresh giving ≤10s-old data is fine, and it absorbs the
    // rapid re-fetches from route churn / the home screen's own polling widgets.
    return this.cache.wrap(`dashboard:${user.userId}`, 10, () => this.buildDashboard(user));
  }

  private async buildDashboard(user: AuthenticatedUser): Promise<DashboardResponse> {
    const [schedule, plannerTasks, upcomingAssignments, leaderboard, announcements] = await Promise.all([
      this.scheduleService.findForUser(user.userId),
      this.plannerService.findAllForOwner(user.userId),
      this.assignmentsService.findAll(1, 10, undefined, true, user.userId),
      // شعبة-scoped so the home leaderboard shows classmates the student is actually competing
      // with (falls back to college-wide for a student with no شعبة set).
      this.gamificationService.getLeaderboard(5, user.department),
      this.announcementsService.list(1, 3, user.department),
    ]);

    const todayDow = new Date().getDay();
    const todaySchedule = schedule
      .filter((entry) => entry.dayOfWeek === todayDow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const uid = new Types.ObjectId(user.userId);
    const plannerDue: DueItem[] = plannerTasks
      .filter((task) => !task.done && task.dueDate)
      .map((task) => ({
        type: 'planner' as const,
        id: task.id,
        title: task.title,
        courseCode: task.courseCode ?? null,
        dueDate: task.dueDate as Date,
        urgency: urgencyOf(task.dueDate, task.done),
      }));

    // Students see assignments they haven't submitted yet; professors/admins didn't "complete"
    // anything they authored, so completedBy is meaningless for them -- show their own upcoming
    // assignments instead, as a reminder of what's about to close.
    const isTeachingStaff = user.role === Role.PROFESSOR || user.role === Role.ADMIN;
    const assignmentDue: DueItem[] = upcomingAssignments
      .filter((assignment) =>
        isTeachingStaff ? assignment.createdBy.equals(uid) : !assignment.completedBy.some((cid) => cid.equals(uid)),
      )
      .map((assignment) => ({
        type: 'assignment' as const,
        id: assignment.id,
        title: assignment.title,
        courseCode: assignment.courseCode,
        dueDate: assignment.dueDate,
        urgency: urgencyOf(assignment.dueDate, false),
      }));

    const dueToday = [...plannerDue, ...assignmentDue]
      .filter((item) => item.urgency === 'overdue' || item.urgency === 'urgent')
      .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 8);

    return { todaySchedule, dueToday, leaderboard, announcements };
  }

  // One call for the student progress dashboard (ProgressDashboard.tsx) -- GPA, attendance and
  // the full assignment list in a single round trip instead of three. Shape mirrors what the
  // individual /gpa, /attendance/summary and /assignments endpoints return, so the client
  // component's existing types still apply.
  getStudyDashboard(user: AuthenticatedUser) {
    return this.cache.wrap(`dashboard-study:${user.userId}`, 30, async () => {
      const [gpaCourses, gpaSummary, attendance, assignments] = await Promise.all([
        this.gpaService.findAllForOwner(user.userId),
        this.gpaService.getSummaryForOwner(user.userId),
        this.attendanceService.getSummaryForOwner(user.userId),
        this.assignmentsService.findAll(1, 100, undefined, false, user.userId, false),
      ]);
      return {
        gpa: { courses: gpaCourses, summary: gpaSummary },
        attendance,
        assignments,
      };
    });
  }
}
