import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalendarEvent, CalendarEventSchema } from './schemas/calendar-event.schema';
import { CalendarEventsService } from './calendar-events.service';
import { CalendarEventsController } from './calendar-events.controller';
import { PushModule } from '../push/push.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: CalendarEvent.name, schema: CalendarEventSchema }]), PushModule],
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService],
  exports: [CalendarEventsService],
})
export class CalendarEventsModule {}
