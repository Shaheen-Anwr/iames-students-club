import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PostsModule } from '../posts/posts.module';
import { QaModule } from '../qa/qa.module';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PostsModule, QaModule, GroupsModule, UsersModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
