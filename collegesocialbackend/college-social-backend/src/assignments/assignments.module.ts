import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Assignment, AssignmentSchema } from './schemas/assignment.schema';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Assignment.name, schema: AssignmentSchema }]),
    GamificationModule,
    // AiModule now also imports AssignmentsModule (for the AI assistant's list/complete-assignment
    // tools) -- forwardRef on both sides breaks the resulting module-level cycle.
    forwardRef(() => AiModule),
    // One-directional: GroupsModule never imports AssignmentsModule back, so no forwardRef needed.
    GroupsModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
