import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DailyQuestionService } from './daily-question.service';
import { ChatEveningDigestService } from './chat-evening-digest.service';

// Admin triggers for the chat's scheduled jobs -- run one now instead of waiting for its cron
// (operations, and checking a deploy). Both are idempotent per day / harmless to re-run.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('ai/jobs')
export class AiJobsController {
  constructor(
    private readonly dailyQuestion: DailyQuestionService,
    private readonly eveningDigest: ChatEveningDigestService,
  ) {}

  @Post('daily-question')
  runDailyQuestion() {
    return this.dailyQuestion.run();
  }

  @Post('evening-digest')
  runEveningDigest() {
    return this.eveningDigest.run();
  }
}
