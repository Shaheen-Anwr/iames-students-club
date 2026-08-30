import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateLectureFolderDto } from './dto/create-lecture-folder.dto';
import { UpdateLectureFolderDto } from './dto/update-lecture-folder.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { SharePostDto } from './dto/share-post.dto';
import { SetReactionDto } from './dto/set-reaction.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PostScope } from './schemas/post.schema';
import { Department } from '../common/enums/department.enum';
import { AcademicYear } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';

@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // POST /api/posts  { caption, attachmentType, attachmentUrl, attachmentOriginalName, courseCode }
  // attachmentUrl comes from a prior call to /api/upload/lecture|video|file
  // A regular caption/image post is open to everyone; a lecture/video/file (course material)
  // upload is admin/professor only -- enforced in PostsService.create() since it depends on the
  // request body, not just the route.
  @HttpPost()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
    return this.postsService.create(user.userId, user.role, user.department, dto);
  }

  // GET /api/posts?page=1&limit=20&courseCode=CS101&author=<userId>&hasAttachment=true&scope=public|department
  // &department=&academicYear=&specialization= -- feed filter dropdowns; ignored when scope is
  // 'department' since that's already locked to the viewer's own department (see PostsService.feed()).
  @Get()
  async feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseCode') courseCode?: string,
    @Query('author') author?: string,
    @Query('hasAttachment') hasAttachment?: string,
    @Query('scope') scope?: PostScope,
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
  ) {
    return this.postsService.feed(
      Number(page) || 1,
      Number(limit) || 20,
      courseCode,
      author,
      hasAttachment === 'true',
      scope,
      user.department,
      { department, academicYear, specialization },
      user.userId,
    );
  }

  // GET /api/posts/courses -> distinct course codes that have attachments, for the course/lecture hub
  // NOTE: must stay above @Get(':id') or it gets swallowed as an id lookup.
  @Get('courses')
  async coursesWithAttachments() {
    return this.postsService.coursesWithAttachments();
  }

  // GET /api/posts/saved?page=1&limit=20 -> the current user's saved posts
  // NOTE: must stay above @Get(':id') or it gets swallowed as an id lookup.
  @Get('saved')
  async savedPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.findSaved(user.userId, Number(page) || 1, Number(limit) || 20);
  }

  // GET /api/posts/lectures?type=lecture|video&department=&academicYear=&specialization=&courseCode=&q=&page=&limit=
  // The PDF/video lecture library (components/lectures/) -- always public, but department-scoped to
  // the viewer's own شعبة when they have one (an explicit `department` is ignored for such a
  // viewer); a departmentless viewer can still browse/filter every شعبة. See
  // PostsService.browseAttachments(). NOTE: must stay above @Get(':id') or it gets swallowed as an
  // id lookup.
  @Get('lectures')
  async browseAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type: 'lecture' | 'video',
    @Query('department') department?: Department,
    @Query('academicYear') academicYear?: AcademicYear,
    @Query('specialization') specialization?: Specialization,
    @Query('courseCode') courseCode?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.browseAttachments(
      type,
      { department, academicYear, specialization, courseCode, q },
      Number(page) || 1,
      Number(limit) || 20,
      user.department,
    );
  }

  // GET /api/posts/lectures/folders?type=lecture|video -> folders for the lecture/video library,
  // for LectureFoldersGrid. NOTE: must stay above @Get(':id') or it gets swallowed as an id lookup.
  @Get('lectures/folders')
  async listLectureFolders(@Query('type') type: 'lecture' | 'video') {
    return this.postsService.listLectureFolders(type);
  }

  // POST /api/posts/lectures/folders  { name, type } -- admin/professor only, see PostsService.
  @HttpPost('lectures/folders')
  async createLectureFolder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLectureFolderDto) {
    return this.postsService.createLectureFolder(user.userId, user.role, dto.name, dto.type);
  }

  // PATCH /api/posts/lectures/folders/:id  { name } -- only the folder's own creator may rename it.
  // Renaming also re-tags every lecture already filed under the old name (see PostsService).
  @Patch('lectures/folders/:id')
  async updateLectureFolder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLectureFolderDto,
  ) {
    return this.postsService.updateLectureFolder(id, user.userId, dto.name);
  }

  // DELETE /api/posts/lectures/folders/:id -- only the folder's own creator may delete it.
  @Delete('lectures/folders/:id')
  async deleteLectureFolder(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.postsService.deleteLectureFolder(id, user.userId);
    return { success: true };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.postsService.findOneForViewer(id, user.userId);
  }

  // GET /api/posts/:id/attachment -- streams the post's raw/'lecture' or 'file' attachment,
  // transparently reassembling it when it was too large for a single Cloudinary asset and got split
  // into pieces on upload (see StorageService.upload()). A normal, unsplit attachment is just
  // redirected straight to its Cloudinary URL -- no extra bandwidth through this server. Frontend
  // components should always link/embed a lecture PDF or generic file through this endpoint rather
  // than a stored attachmentUrl directly, so they never need to know whether it was chunked.
  @Get(':id/attachment')
  async streamAttachment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    await this.postsService.streamAttachment(id, res, user.userId);
  }

  // POST /api/posts/:id/react  { type: 'like'|'dislike'|'care'|'support'|'not_interested'|'sad'|'angry' }
  // Picking the same type again removes the reaction; a different type replaces it.
  @HttpPost(':id/react')
  async setReaction(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SetReactionDto) {
    return this.postsService.setReaction(id, user.userId, dto.type);
  }

  @HttpPost(':id/save')
  async toggleSave(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.postsService.toggleSave(id, user.userId);
  }

  // PATCH /api/posts/:id  { caption } -- author-only, caption edit only
  @Patch(':id')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, user.userId, dto.caption);
  }

  // GET /api/posts/:id/reactions -- who reacted and with what, for the "seen by" modal
  @Get(':id/reactions')
  async listReactions(@Param('id') id: string) {
    return this.postsService.listReactions(id);
  }

  // POST /api/posts/:id/share  { caption? } -- reposts :id to the caller's own feed
  @HttpPost(':id/share')
  async share(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SharePostDto) {
    return this.postsService.share(id, user.userId, user.department, dto);
  }

  // GET /api/posts/:id/comments?page=1&limit=20
  @Get(':id/comments')
  async listComments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.listComments(id, user.userId, Number(page) || 1, Number(limit) || 20);
  }

  // POST /api/posts/:id/comments  { text }
  @HttpPost(':id/comments')
  async addComment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCommentDto) {
    return this.postsService.addComment(id, user.userId, dto.text);
  }

  // PATCH /api/posts/comments/:commentId  { text } -- author-only
  @Patch('comments/:commentId')
  async updateComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.postsService.updateComment(commentId, user.userId, dto.text);
  }

  // GET /api/posts/comments/:commentId/reactions -- same "seen by" pattern as post reactions
  @Get('comments/:commentId/reactions')
  async listCommentReactions(@Param('commentId') commentId: string) {
    return this.postsService.listCommentReactions(commentId);
  }

  // DELETE /api/posts/comments/:commentId -- author-only, also deletes its whole reply subtree
  @Delete('comments/:commentId')
  async removeComment(@Param('commentId') commentId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.postsService.removeComment(commentId, user.userId);
    return { success: true };
  }

  // POST /api/posts/comments/:commentId/react  { type: 'like'|'dislike'|'care'|'support'|'not_interested'|'sad'|'angry' }
  // Same toggle behavior as post reactions -- picking the same type again removes it.
  @HttpPost('comments/:commentId/react')
  async setCommentReaction(
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetReactionDto,
  ) {
    return this.postsService.setCommentReaction(commentId, user.userId, dto.type);
  }

  // GET /api/posts/comments/:commentId/replies?page=1&limit=20 -- direct replies to a comment
  @Get('comments/:commentId/replies')
  async listReplies(@Param('commentId') commentId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.postsService.listReplies(commentId, Number(page) || 1, Number(limit) || 20);
  }

  // POST /api/posts/comments/:commentId/replies  { text } -- replies nest indefinitely
  @HttpPost('comments/:commentId/replies')
  async addReply(
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.addReply(commentId, user.userId, dto.text);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.postsService.remove(id, user.userId);
    return { success: true };
  }
}
