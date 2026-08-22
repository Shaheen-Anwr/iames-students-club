import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { GroupsModule } from '../groups/groups.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { GamificationModule } from '../gamification/gamification.module';
import { QaModule } from '../qa/qa.module';
import { ChatModule } from '../chat/chat.module';
import { AiModule } from '../ai/ai.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { PlannerModule } from '../planner/planner.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminPostsController } from './admin-posts.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminQuizzesController } from './admin-quizzes.controller';
import { AdminAssignmentsController } from './admin-assignments.controller';
import { AdminAnnouncementsController } from './admin-announcements.controller';
import { AdminGamificationController } from './admin-gamification.controller';
import { AdminQaController } from './admin-qa.controller';
import { AdminChatController } from './admin-chat.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    UsersModule,
    PostsModule,
    GroupsModule,
    QuizzesModule,
    AssignmentsModule,
    AnnouncementsModule,
    GamificationModule,
    QaModule,
    ChatModule,
    AiModule,
    ScheduleModule,
    PlannerModule,
    NotificationsModule,
  ],
  controllers: [
    AdminController,
    AdminPostsController,
    AdminStatsController,
    AdminGroupsController,
    AdminQuizzesController,
    AdminAssignmentsController,
    AdminAnnouncementsController,
    AdminGamificationController,
    AdminQaController,
    AdminChatController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
