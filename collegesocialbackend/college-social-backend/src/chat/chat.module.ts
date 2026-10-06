import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ScheduledMessage, ScheduledMessageSchema } from './schemas/scheduled-message.schema';
import { ChatReminder, ChatReminderSchema } from './schemas/chat-reminder.schema';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatPresenceService } from './chat-presence.service';
import { ChatSchedulerService } from './chat-scheduler.service';
import { ChatCallService } from './chat-call.service';
import { ChatRemindersService } from './chat-reminders.service';
import { ChatCardsService } from './chat-cards.service';
import { ChatClassGroupsService } from './chat-class-groups.service';
import { LinkPreviewService } from './link-preview.service';
import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { UploadModule } from '../upload/upload.module';
import { StreamModule } from '../stream/stream.module';
import { GamificationModule } from '../gamification/gamification.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { Assignment, AssignmentSchema } from '../assignments/schemas/assignment.schema';
import { Event, EventSchema } from '../events/schemas/event.schema';
import { Listing, ListingSchema } from '../marketplace/schemas/listing.schema';
import { ChatStatus, ChatStatusSchema } from './schemas/chat-status.schema';
import { VoiceRoom, VoiceRoomSchema } from './schemas/voice-room.schema';
import { ChatStatusController } from './chat-status.controller';
import { ChatStatusService } from './chat-status.service';
import { ChatVoiceRoomsService } from './chat-voice-rooms.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ScheduledMessage.name, schema: ScheduledMessageSchema },
      { name: ChatReminder.name, schema: ChatReminderSchema },
      { name: ChatStatus.name, schema: ChatStatusSchema },
      { name: VoiceRoom.name, schema: VoiceRoomSchema },
      // Read-only, registered directly (not via their modules) to avoid import cycles: class-group
      // membership reads users; ChatCardsService snapshots the items shared as cards.
      { name: User.name, schema: UserSchema },
      { name: Post.name, schema: PostSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Event.name, schema: EventSchema },
      { name: Listing.name, schema: ListingSchema },
    ]),
    AuthModule, // exports JwtModule, needed by ChatGateway to verify socket tokens
    GroupsModule, // ChatGateway also carries group-channel real-time traffic over the same socket
    NotificationsModule,
    UsersModule, // presence (online/last-seen) tracking on connect/disconnect
    UploadModule,
    StreamModule,
    GamificationModule, // points for the daily question (ChatService.votePoll)
  ],
  controllers: [ChatController, ChatStatusController],
  providers: [
    ChatService,
    ChatGateway,
    ChatPresenceService,
    ChatSchedulerService,
    ChatCallService,
    ChatRemindersService,
    ChatCardsService,
    ChatClassGroupsService,
    ChatStatusService,
    ChatVoiceRoomsService,
    LinkPreviewService,
  ],
  exports: [ChatService, ChatClassGroupsService, ChatCardsService],
})
export class ChatModule {}
