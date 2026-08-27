import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MilitaryPeriod, MilitaryPeriodSchema } from './schemas/military-period.schema';
import { MilitaryCheckIn, MilitaryCheckInSchema } from './schemas/military-checkin.schema';
import { MilitaryScheduleItem, MilitaryScheduleItemSchema } from './schemas/military-schedule-item.schema';
import { MilitaryTodo, MilitaryTodoSchema } from './schemas/military-todo.schema';
import { MilitaryStudentSettings, MilitaryStudentSettingsSchema } from './schemas/military-student-settings.schema';
import { MilitaryRosterMember, MilitaryRosterMemberSchema } from './schemas/military-roster-member.schema';
import { Assignment, AssignmentSchema } from '../assignments/schemas/assignment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { GamificationModule } from '../gamification/gamification.module';
import { MilitaryService } from './military.service';
import { MilitaryController } from './military.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MilitaryPeriod.name, schema: MilitaryPeriodSchema },
      { name: MilitaryCheckIn.name, schema: MilitaryCheckInSchema },
      { name: MilitaryScheduleItem.name, schema: MilitaryScheduleItemSchema },
      { name: MilitaryTodo.name, schema: MilitaryTodoSchema },
      { name: MilitaryStudentSettings.name, schema: MilitaryStudentSettingsSchema },
      { name: MilitaryRosterMember.name, schema: MilitaryRosterMemberSchema },
      // Read-only here -- the roster aggregates military assignments. Writes still go through
      // AssignmentsModule; registering the model twice on the same connection is fine.
      { name: Assignment.name, schema: AssignmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    GamificationModule,
  ],
  controllers: [MilitaryController],
  providers: [MilitaryService],
})
export class MilitaryModule {}
