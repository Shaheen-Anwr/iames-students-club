import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StreamService } from './stream.service';

@UseGuards(JwtAuthGuard)
@Controller('stream')
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  // Returns { uploadURL, uid }. The browser tus-uploads the file to uploadURL, then polls
  // GET :uid/status until { ready: true }, then POSTs /api/reels with { streamUid: uid }.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('direct-upload')
  directUpload() {
    return this.stream.createDirectUpload(60);
  }

  @Get(':uid/status')
  status(@Param('uid') uid: string) {
    return this.stream.getStatus(uid);
  }
}
