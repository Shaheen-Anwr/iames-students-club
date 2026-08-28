import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyGroup, StudyGroupSchema } from './schemas/study-group.schema';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { ChannelMessage, ChannelMessageSchema } from './schemas/channel-message.schema';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudyGroup.name, schema: StudyGroupSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: ChannelMessage.name, schema: ChannelMessageSchema },
    ]),
    NotificationsModule,
    UploadModule,
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
