import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlannerTask, PlannerTaskSchema } from './schemas/planner-task.schema';
import { PlannerService } from './planner.service';
import { PlannerController } from './planner.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: PlannerTask.name, schema: PlannerTaskSchema }])],
  controllers: [PlannerController],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
