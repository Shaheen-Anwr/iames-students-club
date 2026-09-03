import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { LectureNotesService } from './lecture-notes.service';

class PutNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('lecture-notes')
export class LectureNotesController {
  constructor(private readonly notes: LectureNotesService) {}

  // GET /api/lecture-notes/:postId -> { body, updatedAt } ("" when none)
  @Get(':postId')
  async get(@Param('postId') postId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.get(user.userId, postId);
  }

  // PUT /api/lecture-notes/:postId { body } -> upsert; empty body deletes.
  @Put(':postId')
  async put(@Param('postId') postId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: PutNoteDto) {
    return this.notes.put(user.userId, postId, dto.body ?? '');
  }
}
