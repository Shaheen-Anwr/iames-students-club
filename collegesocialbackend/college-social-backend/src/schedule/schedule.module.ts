import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleEntry, ScheduleEntrySchema } from './schemas/schedule-entry.schema';
import { ScheduleBoard, ScheduleBoardSchema } from './schemas/schedule-board.schema';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
      { name: ScheduleBoard.name, schema: ScheduleBoardSchema },
    ]),
    UsersModule,
    // PostsModule already (transitively, via AiModule) imports ScheduleModule -- forwardRef on
    // both sides breaks the resulting cycle, same pattern as AiModule/AssignmentsModule.
    forwardRef(() => PostsModule),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
