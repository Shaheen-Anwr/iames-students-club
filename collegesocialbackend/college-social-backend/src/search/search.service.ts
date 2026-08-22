import { Injectable } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';
import { QaService } from '../qa/qa.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { Department } from '../common/enums/department.enum';

const RESULTS_PER_CATEGORY = 10;

@Injectable()
export class SearchService {
  constructor(
    private readonly postsService: PostsService,
    private readonly qaService: QaService,
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService,
  ) {}

  // Fans out across every searchable content type in parallel, each scoped the same way its own
  // module already scopes it (department split for posts/questions, public-only for groups,
  // no scoping for people search -- matching each feature's existing visibility rules).
  async search(query: string, viewerDepartment?: Department | null) {
    // A leading '#' is a hashtag lookup against Post.hashtags rather than a free-text search --
    // questions/groups/users have no hashtag concept, so those legs stay empty for this query shape.
    if (query.startsWith('#')) {
      const tag = query.slice(1).trim();
      if (!tag) return { posts: [], questions: [], groups: [], users: [] };
      const posts = await this.postsService.searchByHashtag(tag, RESULTS_PER_CATEGORY, viewerDepartment);
      return { posts, questions: [], groups: [], users: [] };
    }

    const [posts, questions, groups, users] = await Promise.all([
      this.postsService.search(query, RESULTS_PER_CATEGORY, viewerDepartment),
      this.qaService.search(query, RESULTS_PER_CATEGORY, viewerDepartment),
      this.groupsService.discover(query, 1, RESULTS_PER_CATEGORY),
      this.usersService.search(query),
    ]);
    return { posts, questions, groups, users };
  }
}
