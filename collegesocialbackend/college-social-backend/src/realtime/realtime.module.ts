import { Global, Module } from '@nestjs/common';
import { RealtimeEmitterService } from './realtime-emitter.service';
import { AppEventsService } from './app-events.service';

@Global()
@Module({
  providers: [RealtimeEmitterService, AppEventsService],
  exports: [RealtimeEmitterService, AppEventsService],
})
export class RealtimeModule {}
