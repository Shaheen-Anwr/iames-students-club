import { createReadStream } from 'fs';
import { readFile, stat, unlink } from 'fs/promises';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { maxUploadSizeMb } from '../upload/multer.config';
import { Conversion, ConversionDocument } from './schemas/conversion.schema';
import { ALL_TARGETS, contentTypeFor, FORMATS, SUPPORTED } from './formats';
import { zipBuffers } from './engines/zip.util';

const HISTORY_TTL_HOURS = 24;
const HISTORY_LIMIT = 40;

export interface JobSummary {
  id: string;
  sourceName: string;
  sourceFormat: string;
  targetFormat: string;
  filename: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  stage: string;
  cached: boolean;
  sizeBytes: number;
  error: string | null;
  createdAt: string;
  expiresAt: string;
  tool: string;
  outputIsZip: boolean;
}

@Injectable()
export class ConvertService {
  private readonly logger = new Logger('ConvertService');
  private readonly workers: number;

  constructor(
    @InjectModel(Conversion.name) private readonly conversionModel: Model<ConversionDocument>,
    config: ConfigService,
  ) {
    this.workers = Math.max(1, Number(process.env.CONVERT_WORKERS) || 4);
  }

  capabilities() {
    return {
      maxSizeMb: maxUploadSizeMb('conversions'),
      historyTtlHours: HISTORY_TTL_HOURS,
      maxParallel: this.workers,
      targets: ALL_TARGETS,
      matrix: SUPPORTED,
      formats: Object.values(FORMATS).map(({ ext, label }) => ({ ext, label })),
    };
  }

  async history(userId: string): Promise<JobSummary[]> {
    const rows = await this.conversionModel
      .find({ user: userId, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean()
      .exec();
    return rows.map((r) => this.toSummary(r));
  }

  async job(id: string, userId: string): Promise<JobSummary> {
    const row = await this.conversionModel.findOne({ _id: id, user: userId }).lean().exec().catch(() => null);
    if (!row) throw new NotFoundException('المهمة غير موجودة');
    return this.toSummary(row);
  }

  // Batch poll -- the frontend asks about every job it's still watching in one request.
  async jobs(ids: string[], userId: string): Promise<JobSummary[]> {
    if (!ids.length) return [];
    const rows = await this.conversionModel
      .find({ _id: { $in: ids.slice(0, 50) }, user: userId })
      .lean()
      .exec()
      .catch(() => []);
    return rows.map((r) => this.toSummary(r));
  }

  async streamOutput(id: string, userId: string, res: Response): Promise<void> {
    const doc = await this.conversionModel
      .findOne({ _id: id, user: userId, status: 'done', expiresAt: { $gt: new Date() } })
      .lean()
      .exec()
      .catch(() => null);
    if (!doc?.outputPath) throw new NotFoundException('التحويل غير جاهز أو انتهت صلاحيته');
    if (!(await this.fileExists(doc.outputPath))) throw new NotFoundException('لم يعد ملف التحويل متاحًا');

    res.setHeader('Content-Type', doc.outputIsZip ? 'application/zip' : contentTypeFor(doc.targetFormat));
    res.setHeader('Content-Length', String(doc.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallbackName(doc.outputFilename)}"; filename*=UTF-8''${encodeURIComponent(doc.outputFilename)}`,
    );
    const stream = createReadStream(doc.outputPath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  // Bundle several finished outputs into one .zip.
  async streamZip(ids: string[], userId: string, res: Response): Promise<void> {
    const rows = await this.conversionModel
      .find({ _id: { $in: ids.slice(0, 50) }, user: userId, status: 'done', expiresAt: { $gt: new Date() } })
      .lean()
      .exec()
      .catch(() => []);
    const usable: Array<(typeof rows)[number]> = [];
    for (const r of rows) if (r.outputPath && (await this.fileExists(r.outputPath))) usable.push(r);
    if (!usable.length) throw new NotFoundException('لا توجد ملفات جاهزة للتنزيل');

    const files = await Promise.all(
      usable.map(async (r) => ({ name: r.outputFilename, data: await readFile(r.outputPath!) })),
    );
    const buf = zipBuffers(files);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', `attachment; filename="converted-${Date.now()}.zip"`);
    res.end(buf);
  }

  async remove(id: string, userId: string): Promise<void> {
    const doc = await this.conversionModel.findOneAndDelete({ _id: id, user: userId }).lean().exec().catch(() => null);
    if (!doc) throw new NotFoundException('المهمة غير موجودة');
    if (doc.outputPath) await unlink(doc.outputPath).catch(() => undefined);
    if (doc.inputPath) await unlink(doc.inputPath).catch(() => undefined);
  }

  private fileExists(p: string): Promise<boolean> {
    return stat(p).then((s) => s.isFile()).catch(() => false);
  }

  private toSummary(doc: any): JobSummary {
    return {
      id: String(doc._id),
      sourceName: doc.sourceName,
      sourceFormat: doc.sourceFormat,
      targetFormat: doc.targetFormat,
      filename: doc.outputFilename,
      status: doc.status,
      progress: doc.progress ?? (doc.status === 'done' ? 100 : 0),
      stage: doc.stage ?? '',
      cached: !!doc.cached,
      sizeBytes: doc.sizeBytes ?? 0,
      error: doc.error ?? null,
      createdAt: new Date(doc.createdAt).toISOString(),
      expiresAt: new Date(doc.expiresAt).toISOString(),
      tool: doc.tool ?? 'convert',
      outputIsZip: !!doc.outputIsZip,
    };
  }
}

// RFC 6266: the plain `filename=` param must be ASCII; non-Latin names ride in `filename*=` instead.
function asciiFallbackName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').trim();
  return ascii || 'converted';
}
