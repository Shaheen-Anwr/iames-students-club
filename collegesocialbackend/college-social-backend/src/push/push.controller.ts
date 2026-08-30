import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PushService } from './push.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    await this.pushService.subscribe(user.userId, dto, req.headers['user-agent'] ?? null);
    return { success: true };
  }

  @Post('unsubscribe')
  async unsubscribe(@Body() dto: UnsubscribeDto, @CurrentUser() user: AuthenticatedUser) {
    await this.pushService.unsubscribe(user.userId, dto.endpoint);
    return { success: true };
  }

  // Notification preferences (currently just the morning digest opt-in). Kept here rather than
  // on /users so it sits next to the subscribe/unsubscribe endpoints the settings card already
  // talks to.
  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.pushService.getDigestPreference(user.userId);
  }

  @Patch('preferences')
  setPreferences(@Body() dto: UpdatePushPreferencesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pushService.setDigestPreference(user.userId, dto.dailyDigest);
  }
}
