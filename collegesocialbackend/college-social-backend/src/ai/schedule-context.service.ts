import { Injectable } from '@nestjs/common';
import { ScheduleService } from '../schedule/schedule.service';

// 0 = Sunday .. 6 = Saturday, matching ScheduleEntry.dayOfWeek / JS Date#getDay().
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Grounds "which lecture is that" questions in the student's own timetable -- a bounded, cheap
// dataset (one student's week), so unlike FeedContextService/LectureSearchService this doesn't
// need query-based matching, it's always included in full.
@Injectable()
export class ScheduleContextService {
  constructor(private readonly scheduleService: ScheduleService) {}

  async describeSchedule(ownerId: string): Promise<string | null> {
    const entries = await this.scheduleService.findForUser(ownerId);
    if (entries.length === 0) return null;

    return entries
      .map((entry) => {
        const location = entry.location ? ` (${entry.location})` : '';
        return `${DAY_NAMES[entry.dayOfWeek]} ${entry.startTime}-${entry.endTime}: ${entry.courseName}${location}`;
      })
      .join('\n');
  }
}
