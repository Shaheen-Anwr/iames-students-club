import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadModule } from './upload/upload.module';
import { PostsModule } from './posts/posts.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { GroupsModule } from './groups/groups.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QaModule } from './qa/qa.module';
import { CalendarModule } from './calendar/calendar.module';
import { PlannerModule } from './planner/planner.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodbUri'),
      }),
    }),
    // Global default rate limit; auth endpoints override with tighter limits via @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    // Serves /uploads/** as static files, e.g. http://localhost:3001/uploads/photos/xyz.jpg
    // ServeStaticModule.forRoot() runs at module-load time, before DI, so this reads UPLOADS_DIR
    // straight from process.env (same default as configuration.ts's uploadsDir) rather than via
    // ConfigService -- see multer.config.ts for the same constraint.
    ServeStaticModule.forRoot({
      rootPath: process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    RealtimeModule,
    AuthModule,
    UsersModule,
    UploadModule,
    PostsModule,
    ChatModule,
    AdminModule,
    ScheduleModule,
    AssignmentsModule,
    QuizzesModule,
    GroupsModule,
    NotificationsModule,
    QaModule,
    CalendarModule,
    PlannerModule,
    AnnouncementsModule,
    SearchModule,
    AiModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
