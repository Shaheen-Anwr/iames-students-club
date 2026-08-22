import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './schemas/post.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    GamificationModule,
    NotificationsModule,
    AiModule,
    UsersModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
