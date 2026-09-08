import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
// Aliased -- this app already has its own ScheduleModule (./schedule/schedule.module, class
// timetables) that the bare name would collide with. This one just enables @Cron() decorators
// anywhere in the app (used by CalendarEventsService's reminder-push cron).
import { ScheduleModule as CronScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import configuration from './config/configuration';
import { CacheModule } from './common/cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadModule } from './upload/upload.module';
import { PostsModule } from './posts/posts.module';
import { ReelsModule } from './reels/reels.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { MilitaryModule } from './military/military.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { GroupsModule } from './groups/groups.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QaModule } from './qa/qa.module';
import { CalendarModule } from './calendar/calendar.module';
import { CalendarEventsModule } from './calendar-events/calendar-events.module';
import { PlannerModule } from './planner/planner.module';
import { GpaModule } from './gpa/gpa.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CoursesModule } from './courses/courses.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LectureNotesModule } from './lecture-notes/lecture-notes.module';
import { DigestModule } from './digest/digest.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { ConvertModule } from './convert/convert.module';
import { WallModule } from './wall/wall.module';
import { EventsModule } from './events/events.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { RoomsModule } from './rooms/rooms.module';
import { StreamModule } from './stream/stream.module';
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
    // errorMessage is set explicitly -- otherwise a 429 falls back to @nestjs/throttler's English
    // default, which stands out badly on this all-Arabic UI (e.g. surfaced as a chat toast).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 20 }],
      errorMessage: 'محاولات كثيرة جدًا، حاول مرة أخرى بعد قليل',
    }),
    CronScheduleModule.forRoot(),
    // Read-through cache for hot aggregate endpoints (Redis-backed when REDIS_URL is set, else a
    // per-process TTL map). @Global -- inject CacheService anywhere without importing.
    CacheModule,
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
    ReelsModule,
    ChatModule,
    AdminModule,
    ScheduleModule,
    AssignmentsModule,
    MilitaryModule,
    QuizzesModule,
    GroupsModule,
    NotificationsModule,
    QaModule,
    CalendarModule,
    CalendarEventsModule,
    PlannerModule,
    GpaModule,
    AttendanceModule,
    AnnouncementsModule,
    SearchModule,
    AiModule,
    DashboardModule,
    CoursesModule,
    OnboardingModule,
    LectureNotesModule,
    DigestModule,
    BroadcastModule,
    ConvertModule,
    WallModule,
    EventsModule,
    MarketplaceModule,
    RoomsModule,
    StreamModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
