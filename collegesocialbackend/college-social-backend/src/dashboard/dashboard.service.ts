import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ScheduleService } from '../schedule/schedule.service';
import { PlannerService } from '../planner/planner.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { GamificationService } from '../gamification/gamification.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { ScheduleEntryDocument } from '../schedule/schemas/schedule-entry.schema';
import { AnnouncementDocument } from '../announcements/schemas/announcement.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { urgencyOf, Urgency } from '../common/utils/urgency.util';

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

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, urgent: 1, normal: 2, completed: 3 };

@Injectable()
export class DashboardService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly plannerService: PlannerService,
    private readonly assignmentsService: AssignmentsService,
    private readonly gamificationService: GamificationService,
    private readonly announcementsService: AnnouncementsService,
  ) {}

  async getDashboard(user: AuthenticatedUser): Promise<DashboardResponse> {
    const [schedule, plannerTasks, upcomingAssignments, leaderboard, announcements] = await Promise.all([
      this.scheduleService.findForUser(user.userId),
      this.plannerService.findAllForOwner(user.userId),
      this.assignmentsService.findAll(1, 10, undefined, true, user.userId),
      this.gamificationService.getLeaderboard(5),
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

    const assignmentDue: DueItem[] = upcomingAssignments
      .filter((assignment) => !assignment.completedBy.some((cid) => cid.equals(uid)))
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
}
