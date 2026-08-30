import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WallPost, WallPostSchema } from './schemas/wall-post.schema';
import { WallComment, WallCommentSchema } from './schemas/wall-comment.schema';
import { WallController } from './wall.controller';
import { WallService } from './wall.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WallPost.name, schema: WallPostSchema },
      { name: WallComment.name, schema: WallCommentSchema },
    ]),
    AiModule,
  ],
  controllers: [WallController],
  providers: [WallService],
})
export class WallModule {}
