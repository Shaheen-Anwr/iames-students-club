import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PushService } from './push.service';
import { PushController } from './push.controller';

// Registers the User model directly (rather than importing UsersModule) to avoid a circular
// dependency: UsersModule -> NotificationsModule -> PushModule -> UsersModule.
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
