import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyRoom, StudyRoomSchema } from './schemas/study-room.schema';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: StudyRoom.name, schema: StudyRoomSchema }])],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
