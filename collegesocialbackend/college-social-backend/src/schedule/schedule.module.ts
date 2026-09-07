import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleEntry, ScheduleEntrySchema } from './schemas/schedule-entry.schema';
import { ScheduleBoard, ScheduleBoardSchema } from './schemas/schedule-board.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ScheduleService } from './schedule.service';
import { ScheduleReminderService } from './schedule-reminder.service';
import { ScheduleController } from './schedule.controller';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
      { name: ScheduleBoard.name, schema: ScheduleBoardSchema },
      // Registered directly (also lives in UsersModule) for ScheduleReminderService's recipient
      // query -- same "register twice on one connection is fine" note as DigestModule.
      { name: User.name, schema: UserSchema },
    ]),
    UsersModule,
    // PostsModule already (transitively, via AiModule) imports ScheduleModule -- forwardRef on
    // both sides breaks the resulting cycle, same pattern as AiModule/AssignmentsModule.
    forwardRef(() => PostsModule),
    PushModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleReminderService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
