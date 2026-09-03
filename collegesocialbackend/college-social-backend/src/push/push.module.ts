import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PushService } from './push.service';
import { PushQueueService } from './push-queue.service';
import { PushController } from './push.controller';

// Registers the User model directly (rather than importing UsersModule) to avoid a circular
// dependency: UsersModule -> NotificationsModule -> PushModule -> UsersModule.
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [PushController],
  // PushQueueService self-attaches to PushService on init; it's inert without REDIS_URL.
  providers: [PushService, PushQueueService],
  exports: [PushService],
})
export class PushModule {}
