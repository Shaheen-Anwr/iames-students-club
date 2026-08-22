import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SearchService } from './search.service';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // GET /api/search?q=...
  @Get()
  async search(@CurrentUser() user: AuthenticatedUser, @Query('q') q?: string) {
    if (!q || !q.trim()) return { posts: [], questions: [], groups: [], users: [] };
    return this.searchService.search(q.trim(), user.department);
  }
}
