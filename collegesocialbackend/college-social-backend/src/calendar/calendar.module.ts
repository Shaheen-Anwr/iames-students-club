import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { ScheduleModule } from '../schedule/schedule.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PlannerModule } from '../planner/planner.module';
import { AnnouncementsModule } from '../announcements/announcements.module';

@Module({
  imports: [ScheduleModule, AssignmentsModule, PlannerModule, AnnouncementsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
