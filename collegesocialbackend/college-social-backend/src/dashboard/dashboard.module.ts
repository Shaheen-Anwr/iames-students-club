import { Module } from '@nestjs/common';
import { ScheduleModule } from '../schedule/schedule.module';
import { PlannerModule } from '../planner/planner.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ScheduleModule, PlannerModule, AssignmentsModule, GamificationModule, AnnouncementsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
