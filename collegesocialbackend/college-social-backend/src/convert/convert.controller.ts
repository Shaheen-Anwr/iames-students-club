import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { buildMulterOptions } from '../upload/multer.config';
import { ConvertService } from './convert.service';
import { ConvertQueueService } from './convert-queue.service';
import { ConvertDto } from './dto/convert.dto';

// محوّل الملفات -- PDF / Word / PowerPoint / Excel conversion. Uploads are queued and worked in the
// background (see ConvertQueueService); the request returns immediately and the client polls
// GET /jobs. Outputs are kept ~24h (GET /:id/download); ConvertCleanupService purges them.
@UseGuards(JwtAuthGuard)
@Controller('convert')
export class ConvertController {
  constructor(
    private readonly convertService: ConvertService,
    private readonly queue: ConvertQueueService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return this.convertService.capabilities();
  }

  // GET /api/convert/history -> the caller's recent jobs (any status), newest first.
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.convertService.history(user.userId);
  }

  // GET /api/convert/jobs?ids=a,b,c -> status/progress for the jobs the client is watching.
  @Get('jobs')
  jobs(@Query('ids') ids: string, @CurrentUser() user: AuthenticatedUser) {
    const list = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.convertService.jobs(list, user.userId);
  }

  // GET /api/convert/jobs/:id -> one job's status.
  @Get('jobs/:id')
  jobById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.convertService.job(id, user.userId);
  }

  // POST /api/convert  (multipart: files[] + target) -> { jobs: [{ id, cached, sourceName }] }
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('files', 20, buildMulterOptions('conversions')))
  async convert(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: ConvertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!files?.length) throw new BadRequestException('لم يتم رفع أي ملف');
    const jobs = [];
    for (const file of files) {
      const { id, cached } = await this.queue.enqueue(user.userId, file.path, file.originalname, dto.target);
      jobs.push({ id, cached, sourceName: file.originalname });
    }
    return { jobs };
  }

  // POST /api/convert/download-zip  { ids: [...] } -> a .zip of the finished outputs.
  @Post('download-zip')
  async downloadZip(@Body('ids') ids: string[], @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    await this.convertService.streamZip(Array.isArray(ids) ? ids : [], user.userId, res);
  }

  // GET /api/convert/:id/download -> streams the converted file as an attachment.
  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    await this.convertService.streamOutput(id, user.userId, res);
  }

  // DELETE /api/convert/:id -> drop the job row + its files.
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.convertService.remove(id, user.userId);
    return { success: true };
  }
}
