import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DigestService } from './digest.service';

// Lets a signed-in student fire their own morning digest on demand to preview it. The scheduled
// fan-out to everyone is a @Cron inside DigestService and has no HTTP surface.
@UseGuards(JwtAuthGuard)
@Controller('digest')
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  @Post('test')
  async test(@CurrentUser() user: AuthenticatedUser) {
    const delivered = await this.digestService.sendNow(user.userId);
    return {
      delivered,
      message: delivered
        ? 'تم إرسال الملخص اليومي إلى أجهزتك.'
        : 'لا يوجد ما يُلخّص اليوم (لا محاضرات ولا تسليمات قريبة ولا إعلانات جديدة).',
    };
  }
}
