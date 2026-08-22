import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LectureChunk, LectureChunkSchema } from './schemas/lecture-chunk.schema';
import { AiConversation, AiConversationSchema } from './schemas/ai-conversation.schema';
import { AiMessage, AiMessageSchema } from './schemas/ai-message.schema';
import { AiMemoryFact, AiMemoryFactSchema } from './schemas/ai-memory-fact.schema';
import { Post, PostSchema } from '../posts/schemas/post.schema';
import { Comment, CommentSchema } from '../posts/schemas/comment.schema';
import { LectureIndexService } from './lecture-index.service';
import { LectureSearchService } from './lecture-search.service';
import { FeedContextService } from './feed-context.service';
import { ScheduleContextService } from './schedule-context.service';
import { AiService } from './ai.service';
import { AiToolsService } from './ai-tools.service';
import { AiMemoryService } from './ai-memory.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiController } from './ai.controller';
import { UploadModule } from '../upload/upload.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { PlannerModule } from '../planner/planner.module';
import { ChatModule } from '../chat/chat.module';
import { QaModule } from '../qa/qa.module';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LectureChunk.name, schema: LectureChunkSchema },
      { name: AiConversation.name, schema: AiConversationSchema },
      { name: AiMessage.name, schema: AiMessageSchema },
      { name: AiMemoryFact.name, schema: AiMemoryFactSchema },
      // Read-only access for FeedContextService -- not owned by AiModule. Fetched here (rather
      // than depending on PostsService) to avoid a circular dependency: PostsModule already
      // imports AiModule for LectureIndexService.
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    UploadModule,
    ScheduleModule,
    PlannerModule,
    ChatModule,
    QaModule,
    GroupsModule,
    UsersModule,
    // AssignmentsModule already imports AiModule (for LectureIndexService) -- forwardRef breaks
    // the cycle so AiToolsService can still reuse AssignmentsService's real business logic
    // (gamification points/badges, isPersonal handling) instead of duplicating it.
    forwardRef(() => AssignmentsModule),
  ],
  controllers: [AiController],
  providers: [
    LectureIndexService,
    LectureSearchService,
    FeedContextService,
    ScheduleContextService,
    AiService,
    AiToolsService,
    AiMemoryService,
    AiConversationsService,
  ],
  exports: [LectureIndexService, AiConversationsService],
})
export class AiModule {}
