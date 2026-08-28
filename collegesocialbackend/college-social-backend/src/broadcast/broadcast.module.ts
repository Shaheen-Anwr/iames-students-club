import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { ReleaseKeyGuard } from './release-key.guard';

// Standalone "push a platform update to everyone" endpoint, driven by the repo's post-commit git
// hook. Only needs PushService (ConfigService is global).
@Module({
  imports: [PushModule],
  controllers: [BroadcastController],
  providers: [BroadcastService, ReleaseKeyGuard],
})
export class BroadcastModule {}
