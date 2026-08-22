import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleEntry, ScheduleEntrySchema } from './schemas/schedule-entry.schema';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: ScheduleEntry.name, schema: ScheduleEntrySchema }]), UsersModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
