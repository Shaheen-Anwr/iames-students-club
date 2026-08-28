import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BroadcastService } from './broadcast.service';
import { ReleaseBroadcastDto } from './dto/release-broadcast.dto';
import { ReleaseKeyGuard } from './release-key.guard';

@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  // POST /api/broadcast/release  { body, title?, url? }   header: x-broadcast-key: <secret>
  // Pushes a "new update shipped" notification to every subscribed user. Auth is the shared
  // secret only (see ReleaseKeyGuard) -- it's invoked by the post-commit git hook, not a user.
  @Post('release')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ReleaseKeyGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async release(@Body() dto: ReleaseBroadcastDto) {
    return this.broadcastService.release(dto);
  }
}
