import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { OnboardingService } from './onboarding.service';

@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // GET /api/onboarding -> { completedAt, showChecklist, checklist[], activeDays, activated }
  // Drives the welcome flow's cross-device "already done?" check + the first-week checklist card.
  @Get()
  async state(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.getState(user.userId);
  }

  // POST /api/onboarding/complete -> stamps onboardingCompletedAt (idempotent).
  @Post('complete')
  async complete(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.markComplete(user.userId);
  }
}
