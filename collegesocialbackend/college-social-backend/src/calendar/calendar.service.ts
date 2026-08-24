import { Injectable } from '@nestjs/common';
import { ScheduleService } from '../schedule/schedule.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { PlannerService } from '../planner/planner.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { CalendarEventsService } from '../calendar-events/calendar-events.service';
import { Department } from '../common/enums/department.enum';

export type CalendarEventType = 'class' | 'assignment' | 'task' | 'announcement' | 'event' | 'reminder';

export interface CalendarEvent {
  date: string; // ISO date, e.g. "2026-08-21"
  type: CalendarEventType;
  title: string;
  // class only
  startTime?: string;
  endTime?: string;
  location?: string | null;
  // assignment/task/announcement
  id?: string;
  courseCode?: string;
  // event/reminder only -- 'startTime' above doubles as their optional/required time-of-day, no
  // separate field needed.
  notes?: string | null;
}

// Aggregates from each feature module's own data at query time rather than owning a separate
// "calendar event" collection for most of these -- ScheduleEntry (recurring weekly slots),
// Assignment (one-off due dates), PlannerTask (personal to-dos), and Announcement (dated
// department/platform notices) each stay the source of truth for their own data. CalendarEvent
// (event/reminder) is the one type this calendar actually owns itself.
@Injectable()
export class CalendarService {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly assignmentsService: AssignmentsService,
    private readonly plannerService: PlannerService,
    private readonly announcementsService: AnnouncementsService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  async getEvents(userId: string, department: Department | null, month: number, year: number): Promise<CalendarEvent[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const [scheduleEntries, assignments, tasks, announcements, calendarEvents] = await Promise.all([
      this.scheduleService.findForUser(userId),
      this.assignmentsService.findDueInRange(monthStart, monthEnd, userId),
      this.plannerService.findDueInRange(userId, monthStart, monthEnd),
      this.announcementsService.findEventsInRange(monthStart, monthEnd, department),
      this.calendarEventsService.findInRange(userId, monthStart, monthEnd),
    ]);

    const events: CalendarEvent[] = [];

    // Expand each recurring weekly slot into every matching date within the requested month.
    for (const entry of scheduleEntries) {
      for (let day = new Date(monthStart); day < monthEnd; day.setUTCDate(day.getUTCDate() + 1)) {
        if (day.getUTCDay() === entry.dayOfWeek) {
          events.push({
            date: day.toISOString().slice(0, 10),
            type: 'class',
            title: entry.courseName,
            startTime: entry.startTime,
            endTime: entry.endTime,
            location: entry.location,
          });
        }
      }
    }

    for (const assignment of assignments) {
      events.push({
        date: assignment.dueDate.toISOString().slice(0, 10),
        type: 'assignment',
        title: assignment.title,
        id: assignment.id,
        courseCode: assignment.courseCode,
      });
    }

    for (const task of tasks) {
      if (!task.dueDate) continue;
      events.push({
        date: task.dueDate.toISOString().slice(0, 10),
        type: 'task',
        title: task.title,
        id: task.id,
        courseCode: task.courseCode ?? undefined,
      });
    }

    for (const announcement of announcements) {
      if (!announcement.eventDate) continue;
      events.push({
        date: announcement.eventDate.toISOString().slice(0, 10),
        type: 'announcement',
        title: announcement.title,
        id: announcement.id,
      });
    }

    for (const calendarEvent of calendarEvents) {
      events.push({
        date: calendarEvent.date.toISOString().slice(0, 10),
        type: calendarEvent.kind,
        title: calendarEvent.title,
        id: calendarEvent.id,
        startTime: calendarEvent.time ?? undefined,
        notes: calendarEvent.notes,
      });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  }
}
