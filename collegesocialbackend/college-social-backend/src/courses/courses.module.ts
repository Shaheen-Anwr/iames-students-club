import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { QaModule } from '../qa/qa.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

// Read-only aggregate module -- pulls from existing feature services, owns no schema of its own.
// CacheService comes from the @Global CacheModule.
@Module({
  imports: [PostsModule, AssignmentsModule, QaModule, QuizzesModule, ScheduleModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
