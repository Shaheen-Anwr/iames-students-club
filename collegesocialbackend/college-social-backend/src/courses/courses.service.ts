import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PostsService } from '../posts/posts.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { QaService } from '../qa/qa.service';
import { QuizzesService } from '../quizzes/quizzes.service';
import { ScheduleService } from '../schedule/schedule.service';

// One server-side fan-out for the course hub screen (CourseHubDetail). Replaces five separate
// round trips from the client -- lectures + assignments + Q&A + quizzes + the student's timetable
// slots for the course -- with one call, computed once and cached briefly.
@Injectable()
export class CoursesService {
  constructor(
    private readonly cache: CacheService,
    private readonly posts: PostsService,
    private readonly assignments: AssignmentsService,
    private readonly qa: QaService,
    private readonly quizzes: QuizzesService,
    private readonly schedule: ScheduleService,
  ) {}

  async getOverview(rawCode: string, user: AuthenticatedUser) {
    const code = rawCode.trim();
    const norm = code.toLowerCase();
    // Per-user key: assignment completion, quiz attempts and the timetable are all viewer-specific,
    // and post visibility is scoped to the viewer's department. Short TTL -- this is a burst guard,
    // not a staleness trade-off.
    const key = `course-overview:${norm}:${user.userId}`;

    return this.cache.wrap(key, 15, async () => {
      const [lectures, assignments, questions, quizzes, allSlots] = await Promise.allSettled([
        this.posts.feed(1, 50, code, undefined, true, undefined, user.department, {}, user.userId),
        this.assignments.findAll(1, 50, code, false, user.userId, false),
        this.qa.listQuestions(1, 50, code, undefined, user.department),
        this.quizzes.findAll(1, 50, code, user.userId),
        this.schedule.findForUser(user.userId),
      ]);

      const settled = <T>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);

      const assignmentList = settled(assignments).sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );

      const slots = settled(allSlots)
        .filter((s) => s.courseName.trim().toLowerCase() === norm)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

      return {
        lectures: settled(lectures),
        assignments: assignmentList,
        questions: settled(questions),
        quizzes: settled(quizzes),
        slots,
      };
    });
  }
}
