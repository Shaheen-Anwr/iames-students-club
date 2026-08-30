import { readdir, rmdir, unlink } from 'fs/promises';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversion, ConversionDocument } from './schemas/conversion.schema';

// The TTL index on Conversion.expiresAt lets MongoDB drop expired history rows on its own, but not
// the files they point at. This hourly sweep walks <uploadsDir>/conversions/<userId>/ and deletes
// any file that no longer has a live (non-expired) row -- covering both expiry and any row removed
// out-of-band. Cheap: a handful of files per user, one indexed lookup each.
@Injectable()
export class ConvertCleanupService {
  private readonly logger = new Logger('ConvertCleanup');
  private readonly root: string;

  constructor(
    @InjectModel(Conversion.name) private readonly conversionModel: Model<ConversionDocument>,
    config: ConfigService,
  ) {
    this.root = join(config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads'), 'conversions');
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
}
