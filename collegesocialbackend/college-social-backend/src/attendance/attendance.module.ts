import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceRecord, AttendanceRecordSchema } from './schemas/attendance-record.schema';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AttendanceRecord.name, schema: AttendanceRecordSchema }]),
    // For ScheduleService.findForUser -- ScheduleModule already exports it.
    ScheduleModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
