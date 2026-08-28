import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ReelsService } from './reels.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { CreateReelCommentDto } from './dto/create-reel-comment.dto';

// اكاديميا (Academia Reels) -- a TikTok-style vertical short-video feed any user can post to.
// Video bytes go straight from the browser to Cloudinary; POST /reels only receives the resulting
// public_id(s) (or a pre-confirmed URL on the fallback path) and validates the 60s cap.
@UseGuards(JwtAuthGuard)
@Controller('reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  // POST /api/reels  { publicIds | videoUrl, caption?, durationSec?, chunkCount? }
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReelDto) {
    return this.reelsService.create(user.userId, dto);
  }

  // GET /api/reels?page=1&limit=10&author=<userId>&hashtag=<tag>
  @Get()
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('author') author?: string,
    @Query('hashtag') hashtag?: string,
  ) {
    return this.reelsService.feed(user.userId, Number(page) || 1, Number(limit) || 10, author, hashtag);
  }

  // --- comment routes must stay above :id so "comments" isn't read as a reel id ---

  // POST /api/reels/comments/:commentId/like -> toggle a like on a reel comment
  @Post('comments/:commentId/like')
  likeComment(@Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reelsService.toggleCommentLike(commentId, user.userId);
  }

  // DELETE /api/reels/comments/:commentId -> author (or admin) only
  @Delete('comments/:commentId')
  async removeComment(@Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.reelsService.removeComment(commentId, { userId: user.userId, role: user.role });
    return { success: true };
  }

  // GET /api/reels/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reelsService.findOne(id, user.userId);
  }

  // POST /api/reels/:id/like -> toggle like
  @Post(':id/like')
  like(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reelsService.toggleLike(id, user.userId);
  }

  // POST /api/reels/:id/save -> toggle save/bookmark
  @Post(':id/save')
  save(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reelsService.toggleSave(id, user.userId);
  }

  // POST /api/reels/:id/view -> count one view (client fires once after a couple seconds watched)
  @Post(':id/view')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  view(@Param('id') id: string) {
    return this.reelsService.registerView(id);
  }

  // DELETE /api/reels/:id -> author (or admin) only; also removes comments + the Cloudinary asset
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.reelsService.remove(id, { userId: user.userId, role: user.role });
    return { success: true };
  }

  // GET /api/reels/:id/comments?page=1&limit=20&parent=<commentId>
  @Get(':id/comments')
  listComments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('parent') parent?: string,
  ) {
    return this.reelsService.listComments(id, user.userId, Number(page) || 1, Number(limit) || 20, parent);
  }

  // POST /api/reels/:id/comments  { text, parent? }
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReelCommentDto,
  ) {
    return this.reelsService.addComment(id, user.userId, dto.text, dto.parent);
  }
}
