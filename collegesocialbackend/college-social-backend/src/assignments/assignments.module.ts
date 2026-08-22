import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Assignment, AssignmentSchema } from './schemas/assignment.schema';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Assignment.name, schema: AssignmentSchema }]),
    GamificationModule,
    // AiModule now also imports AssignmentsModule (for the AI assistant's list/complete-assignment
    // tools) -- forwardRef on both sides breaks the resulting module-level cycle.
    forwardRef(() => AiModule),
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
