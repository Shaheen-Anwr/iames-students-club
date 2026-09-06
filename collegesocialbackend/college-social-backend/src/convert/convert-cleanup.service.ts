import { readdir, rmdir, unlink } from 'fs/promises';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversion, ConversionDocument } from './schemas/conversion.schema';
import { StagedUpload, StagedUploadDocument } from './schemas/staged-upload.schema';

// The TTL index on Conversion.expiresAt lets MongoDB drop expired history rows on its own, but not
// the files they point at. This hourly sweep walks <uploadsDir>/conversions/<userId>/ and deletes
// any file that no longer has a live (non-expired) row -- covering both expiry and any row removed
// out-of-band. Cheap: a handful of files per user, one indexed lookup each.
@Injectable()
export class ConvertCleanupService {
  private readonly logger = new Logger('ConvertCleanup');
  private readonly root: string;
  private readonly stagedRoot: string;

  constructor(
    @InjectModel(Conversion.name) private readonly conversionModel: Model<ConversionDocument>,
    @InjectModel(StagedUpload.name) private readonly stagedModel: Model<StagedUploadDocument>,
    config: ConfigService,
  ) {
    const uploadsDir = config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads');
    this.root = join(uploadsDir, 'conversions');
    this.stagedRoot = join(uploadsDir, 'conversions', 'staged');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    let userDirs: string[];
    try {
      userDirs = await readdir(this.root);
    } catch {
      return; // nothing converted yet
    }

    let removed = 0;
    for (const userId of userDirs) {
      if (userId === 'staged') continue; // swept separately below -- different shape (per-user dirs of staged PDFs + thumb cache, not job outputs)
      const userPath = join(this.root, userId);
      let files: string[];
      try {
        files = await readdir(userPath);
      } catch {
        continue;
      }

      for (const file of files) {
        const full = join(userPath, file);
        const live = await this.conversionModel
          .exists({ outputPath: full, expiresAt: { $gt: new Date() } })
          .catch(() => null);
        if (!live) {
          await unlink(full).catch(() => undefined);
          removed++;
        }
      }

      await readdir(userPath)
        .then((left) => (left.length === 0 ? rmdir(userPath) : undefined))
        .catch(() => undefined);
    }

    if (removed) this.logger.log(`swept ${removed} expired conversion file(s)`);
  }

  // Same "no live DB row -> delete" logic as sweep() above, applied to the page-editor's staged
  // uploads (<stagedRoot>/<userId>/<uuid>.pdf) and their cached thumbnails (named "<stagedId>-p<n>.png"
  // -- the id prefix is how a thumbnail maps back to its StagedUpload row without a path match).
  // Staging is meant to be single-use and short-lived (2h TTL): a file only lingers here if the user
  // uploaded it and never finished choosing an action.
  @Cron(CronExpression.EVERY_HOUR)
  async sweepStaged(): Promise<void> {
    let userDirs: string[];
    try {
      userDirs = await readdir(this.stagedRoot);
    } catch {
      return; // nothing staged yet
    }

    let removed = 0;
    for (const userId of userDirs) {
      const userPath = join(this.stagedRoot, userId);
      let files: string[];
      try {
        files = await readdir(userPath);
      } catch {
        continue;
      }

      for (const file of files) {
        const full = join(userPath, file);
        const thumbMatch = file.match(/^([0-9a-f]{24})-p\d+\.png$/i);
        const live = thumbMatch
          ? await this.stagedModel.exists({ _id: thumbMatch[1], expiresAt: { $gt: new Date() } }).catch(() => null)
          : await this.stagedModel.exists({ storedPath: full, expiresAt: { $gt: new Date() } }).catch(() => null);
        if (!live) {
          await unlink(full).catch(() => undefined);
          removed++;
        }
      }

      await readdir(userPath)
        .then((left) => (left.length === 0 ? rmdir(userPath) : undefined))
        .catch(() => undefined);
    }

    if (removed) this.logger.log(`swept ${removed} orphaned staged upload file(s)`);
  }
}
