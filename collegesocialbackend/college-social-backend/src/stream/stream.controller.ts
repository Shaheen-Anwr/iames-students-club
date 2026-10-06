import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SignVideoUploadDto } from '../upload/dto/sign-video-upload.dto';
import { StreamService } from './stream.service';

@UseGuards(JwtAuthGuard)
@Controller('stream')
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  // Returns { uploadURL, uid }. The browser uploads the file to uploadURL, then polls
  // GET :uid/status until { ready: true }, then POSTs /api/reels (or /api/chat/statuses) with
  // { streamUid: uid }. The video records who uploaded it; a story upload is also marked with
  // meta.purpose so the 24h story sweep can find it.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('direct-upload')
  directUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: SignVideoUploadDto) {
    return this.stream.createDirectUpload(60, { creator: user.userId, purpose: dto.purpose });
  }

  @Get(':uid/status')
  status(@Param('uid') uid: string) {
    return this.stream.getStatus(uid);
  }
}
