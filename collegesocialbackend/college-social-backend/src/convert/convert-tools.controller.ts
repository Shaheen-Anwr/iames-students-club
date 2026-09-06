import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { v4 as uuid } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { buildMulterOptions } from '../upload/multer.config';
import { StagedUpload, StagedUploadDocument } from './schemas/staged-upload.schema';
import { ConvertQueueService } from './convert-queue.service';
import { countPdfPages, renderPageThumbnail } from './engines/pageimage.engine';
import { CompressDto, OcrDto, PagesDto, PasswordDto, ReorderDto, RotateDto, SplitDto, StagedRefDto, WatermarkDto } from './dto/pdf-tools.dto';
import { adobeAvailable } from './engines/adobe.engine';
import { gsAvailable } from './engines/ghostscript.engine';

const STAGED_TTL_MS = 2 * 3600_000; // 2h -- an editing session, not a history item
const MAX_STAGE_MB = 25;

// PDF tools that operate on a whole file with no per-page context (merge/images-to-pdf reorder
// whole *files*, already in browser memory; compress/protect/remove-password/watermark/ocr are
// one-shot whole-document form submissions) go straight to ConvertQueueService.enqueueTool below.
// Tools that need visual per-page context (reorder/rotate/pages/split) go through the staging flow
// first: POST .../stage -> thumbnail grid built from GET .../pages/:page/thumb -> POST .../{tool}.
@UseGuards(JwtAuthGuard)
@Controller('convert/tools')
export class ConvertToolsController {
  private readonly stagedRoot: string;

  constructor(
    @InjectModel(StagedUpload.name) private readonly stagedModel: Model<StagedUploadDocument>,
    private readonly queue: ConvertQueueService,
    config: ConfigService,
  ) {
    this.stagedRoot = join(config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads'), 'conversions', 'staged');
  }

  // POST /api/convert/tools/stage (multipart: file) -> { stagedId, pageCount }
  @Post('stage')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions', MAX_STAGE_MB)))
  async stage(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    if (!/\.pdf$/i.test(file.originalname)) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('هذه الأداة تعمل على ملفات PDF فقط');
    }

    const bytes = await readFile(file.path);
    let pageCount: number;
    try {
      pageCount = await countPdfPages(bytes);
    } catch {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('تعذّر قراءة ملف PDF، قد يكون تالفًا أو محميًا بكلمة مرور');
    }

    const userDir = join(this.stagedRoot, user.userId);
    await mkdir(userDir, { recursive: true });
    const storedPath = join(userDir, `${uuid()}.pdf`);
    await rename(file.path, storedPath);

    const doc = await this.stagedModel.create({
      user: user.userId,
      originalName: file.originalname,
      storedPath,
      pageCount,
      sizeBytes: file.size,
      expiresAt: new Date(Date.now() + STAGED_TTL_MS),
    });
    return { stagedId: String(doc._id), pageCount };
  }

  // GET /api/convert/tools/stage/:id/pages/:page/thumb?token=... -> image/png
  // Auth via the query-param JWT extractor already wired into JwtStrategy (see extractFromQuery) --
  // an <img> tag can't carry an Authorization header.
  @Get('stage/:id/pages/:page/thumb')
  async thumb(
    @Param('id') id: string,
    @Param('page') pageParam: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const staged = await this.stagedModel
      .findOne({ _id: id, user: user.userId, expiresAt: { $gt: new Date() } })
      .lean()
      .exec()
      .catch(() => null);
    if (!staged) throw new NotFoundException('انتهت صلاحية الملف، أعد رفعه');

    const page = Number(pageParam);
    if (!Number.isInteger(page) || page < 0 || page >= staged.pageCount) {
      throw new BadRequestException('رقم صفحة غير صالح');
    }

    const thumbPath = join(dirname(staged.storedPath), `${id}-p${page}.png`);
    let png: Buffer;
    try {
      png = await readFile(thumbPath);
    } catch {
      const bytes = await readFile(staged.storedPath);
      png = await renderPageThumbnail(bytes, page, 90);
      await writeFile(thumbPath, png).catch(() => undefined); // best-effort cache
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(png);
  }

  // POST /api/convert/tools/reorder { stagedId, order } -> { id }
  @Post('reorder')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async reorder(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser) {
    const staged = await this.finalizeStaged(dto, user.userId);
    return this.queue.enqueueTool(user.userId, 'reorder', [staged.storedPath], staged.originalName, { order: dto.order });
  }

  // POST /api/convert/tools/rotate { stagedId, rotations } -> { id }
  @Post('rotate')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async rotate(@Body() dto: RotateDto, @CurrentUser() user: AuthenticatedUser) {
    const staged = await this.finalizeStaged(dto, user.userId);
    return this.queue.enqueueTool(user.userId, 'rotate', [staged.storedPath], staged.originalName, { rotations: dto.rotations });
  }

  // POST /api/convert/tools/pages { stagedId, pages, mode } -> { id }
  @Post('pages')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async pages(@Body() dto: PagesDto, @CurrentUser() user: AuthenticatedUser) {
    const staged = await this.finalizeStaged(dto, user.userId);
    const keep =
      dto.mode === 'keep'
        ? dto.pages
        : Array.from({ length: staged.pageCount }, (_, i) => i).filter((i) => !dto.pages.includes(i));
    if (!keep.length) throw new BadRequestException('لا يمكن حذف كل صفحات المستند');
    return this.queue.enqueueTool(user.userId, 'pages', [staged.storedPath], staged.originalName, { keep });
  }

  // POST /api/convert/tools/split { stagedId, groups } -> { id }
  @Post('split')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async split(@Body() dto: SplitDto, @CurrentUser() user: AuthenticatedUser) {
    const staged = await this.finalizeStaged(dto, user.userId);
    return this.queue.enqueueTool(user.userId, 'split', [staged.storedPath], staged.originalName, { groups: dto.groups });
  }

  // POST /api/convert/tools/merge (multipart: files[], 2-50 PDFs) -> { id }
  @Post('merge')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('files', 50, buildMulterOptions('conversions')))
  async merge(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthenticatedUser) {
    if (!files || files.length < 2) throw new BadRequestException('اختر ملفّي PDF على الأقل للدمج');
    if (files.some((f) => !/\.pdf$/i.test(f.originalname))) {
      await Promise.all(files.map((f) => unlink(f.path).catch(() => undefined)));
      throw new BadRequestException('هذه الأداة تعمل على ملفات PDF فقط');
    }
    return this.queue.enqueueTool(
      user.userId,
      'merge',
      files.map((f) => f.path),
      'دمج.pdf',
      {},
    );
  }

  // POST /api/convert/tools/images-to-pdf (multipart: files[], 1-50 images) -> { id }
  @Post('images-to-pdf')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('files', 50, buildMulterOptions('conversions')))
  async imagesToPdf(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthenticatedUser) {
    if (!files?.length) throw new BadRequestException('لم يتم رفع أي صور');
    return this.queue.enqueueTool(
      user.userId,
      'images-to-pdf',
      files.map((f) => f.path),
      'صور.pdf',
      {},
    );
  }

  // POST /api/convert/tools/watermark (multipart: file + text/opacity/fontSize/rotationDeg) -> { id }
  @Post('watermark')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions')))
  async watermark(@UploadedFile() file: Express.Multer.File, @Body() dto: WatermarkDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.queue.enqueueTool(user.userId, 'watermark', [file.path], file.originalname, {
      text: dto.text,
      opacity: dto.opacity,
      fontSize: dto.fontSize,
      rotationDeg: dto.rotationDeg,
    });
  }

  // GET /api/convert/tools/capabilities -> which Adobe-only tools are actually usable right now, so
  // the frontend can hide/disable protect/remove-password instead of letting a submit 500.
  @Get('capabilities')
  async capabilities() {
    return { protectAvailable: adobeAvailable(), compressAvailable: (await gsAvailable()) || adobeAvailable() };
  }

  // POST /api/convert/tools/compress (multipart: file + level?) -> { id }
  @Post('compress')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions')))
  async compress(@UploadedFile() file: Express.Multer.File, @Body() dto: CompressDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.queue.enqueueTool(user.userId, 'compress', [file.path], file.originalname, { level: dto.level ?? 'medium' });
  }

  // POST /api/convert/tools/ocr (multipart: file + language?) -> { id }
  @Post('ocr')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions')))
  async ocr(@UploadedFile() file: Express.Multer.File, @Body() dto: OcrDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.queue.enqueueTool(user.userId, 'ocr', [file.path], file.originalname, { language: dto.language ?? 'ara+eng' });
  }

  // POST /api/convert/tools/protect (multipart: file + password) -> { id }
  @Post('protect')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions')))
  async protect(@UploadedFile() file: Express.Multer.File, @Body() dto: PasswordDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.queue.enqueueTool(user.userId, 'protect', [file.path], file.originalname, { password: dto.password });
  }

  // POST /api/convert/tools/remove-password (multipart: file + password) -> { id }
  @Post('remove-password')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', buildMulterOptions('conversions')))
  async removePassword(@UploadedFile() file: Express.Multer.File, @Body() dto: PasswordDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
    return this.queue.enqueueTool(user.userId, 'remove-password', [file.path], file.originalname, { password: dto.password });
  }

  // Validates ownership + non-expiry, then hands the staged file's own path back for the caller to
  // enqueue -- staging is single-use, so the StagedUpload row is deleted immediately (the file
  // itself is now owned by the Conversion job and cleaned up by the queue worker, not this sweep).
  private async finalizeStaged(dto: StagedRefDto, userId: string): Promise<{ storedPath: string; originalName: string; pageCount: number }> {
    const staged = await this.stagedModel
      .findOne({ _id: dto.stagedId, user: userId, expiresAt: { $gt: new Date() } })
      .lean()
      .exec()
      .catch(() => null);
    if (!staged) throw new NotFoundException('انتهت صلاحية الملف، أعد رفعه');
    await this.stagedModel.deleteOne({ _id: dto.stagedId }).catch(() => undefined);
    return { storedPath: staged.storedPath, originalName: staged.originalName, pageCount: staged.pageCount };
  }
}
