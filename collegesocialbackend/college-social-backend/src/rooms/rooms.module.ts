import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyRoom, StudyRoomSchema } from './schemas/study-room.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PushModule } from '../push/push.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

// User model registered directly (not via UsersModule) to read friends / bump the room streak --
// same pattern as PushModule / NotificationsModule.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudyRoom.name, schema: StudyRoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
    PushModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
