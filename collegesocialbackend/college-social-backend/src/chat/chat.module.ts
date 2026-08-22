import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { LinkPreviewService } from './link-preview.service';
import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AuthModule, // exports JwtModule, needed by ChatGateway to verify socket tokens
    GroupsModule, // ChatGateway also carries group-channel real-time traffic over the same socket
    NotificationsModule,
    UsersModule, // presence (online/last-seen) tracking on connect/disconnect
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, LinkPreviewService],
  exports: [ChatService],
})
export class ChatModule {}
