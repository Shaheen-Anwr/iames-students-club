import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reel, ReelSchema } from './schemas/reel.schema';
import { ReelComment, ReelCommentSchema } from './schemas/reel-comment.schema';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { UploadModule } from '../upload/upload.module';
import { StreamModule } from '../stream/stream.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reel.name, schema: ReelSchema },
      { name: ReelComment.name, schema: ReelCommentSchema },
    ]),
    UploadModule,
    StreamModule,
    NotificationsModule,
    UsersModule,
    GamificationModule,
  ],
  controllers: [ReelsController],
  providers: [ReelsService],
})
export class ReelsModule {}
