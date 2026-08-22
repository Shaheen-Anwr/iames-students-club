import { Controller, Get } from '@nestjs/common';

// GET /api -- used as Render's health check target and a quick way to confirm the deploy is live.
@Controller()
export class AppController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
