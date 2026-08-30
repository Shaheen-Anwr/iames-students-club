import { createHash } from 'crypto';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuid } from 'uuid';
import { Conversion, ConversionDocument } from './schemas/conversion.schema';
import { buildOutputName, FORMATS, isSupportedPair, normalizeFormat } from './formats';
import { runConversion } from './engines';

// Background worker pool for conversions. POST /api/convert only writes the upload to disk and
// enqueues a job row -- this service claims queued rows (atomically, so it's safe even across
// several backend instances), runs the engine, streams live progress onto the row, and writes the
// output. The HTTP request returns in milliseconds; the frontend polls GET /api/convert/jobs.
@Injectable()
export class ConvertQueueService implements OnModuleInit {
  private readonly logger = new Logger('ConvertQueue');
  private readonly outputRoot: string;
  // Adobe jobs are I/O-bound (waiting on Adobe's servers), so several can be in flight at once.
  private readonly maxWorkers = Math.max(1, Number(process.env.CONVERT_WORKERS) || 4);
  private running = 0;
  private pumping = false;

  constructor(
    @InjectModel(Conversion.name) private readonly model: Model<ConversionDocument>,
    config: ConfigService,
  ) {
    this.outputRoot = join(config.get<string>('uploadsDir') ?? join(process.cwd(), 'uploads'), 'conversions');
  }

  async onModuleInit(): Promise<void> {
    // Jobs left mid-flight by a previous process are dead -- fail them so the UI stops polling.
    await this.model
      .updateMany(
        { status: 'processing' },
        { status: 'failed', stage: '', error: 'توقفت المعالجة، حاول مرة أخرى.' },
      )
      .catch(() => undefined);
    this.pump();
  }

  // Safety net: pick up jobs that were queued while every worker was busy (or enqueued by another
  // instance) even if no new request comes in.
  @Interval(4000)
  private tick(): void {
    if (this.running < this.maxWorkers) this.pump();
  }

  /**
   * Validate + register one upload. Returns the job id; if an identical (bytes, target) conversion
   * already finished, its output is cloned and the job is 'done' immediately (no engine run).
   */
  async enqueue(userId: string, inputPath: string, originalName: string, target: string): Promise<{ id: string; cached: boolean }> {
    const source = normalizeFormat(originalName);
    const to = normalizeFormat(target);
    if (!source) {
      await unlink(inputPath).catch(() => undefined);
      throw new BadRequestException('صيغة غير مدعومة. المدعوم: PDF وWord وPowerPoint وExcel.');
    }
    if (!to || !isSupportedPair(source, to)) {
      await unlink(inputPath).catch(() => undefined);
      throw new BadRequestException(`لا يمكن التحويل من ${FORMATS[source].label} إلى .${target}`);
    }

    const bytes = await readFile(inputPath);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const outputFilename = buildOutputName(originalName, to);
    const expiresAt = new Date(Date.now() + 24 * 3600_000);

    const hit = await this.model
      .findOne({ sourceHash: hash, targetFormat: to, status: 'done', outputPath: { $ne: null }, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
      .catch(() => null);
    if (hit?.outputPath && (await this.fileExists(hit.outputPath))) {
      const userDir = join(this.outputRoot, userId);
      await mkdir(userDir, { recursive: true });
      const outputPath = join(userDir, `${uuid()}.${to}`);
      await copyFile(hit.outputPath, outputPath);
      const doc = await this.model.create({
        user: userId,
        sourceName: originalName,
        sourceFormat: source,
        targetFormat: to,
        sourceHash: hash,
        status: 'done',
        progress: 100,
        stage: 'اكتمل (من نتيجة سابقة)',
        outputFilename,
        outputPath,
        sizeBytes: hit.sizeBytes,
        cached: true,
        expiresAt,
      });
      await unlink(inputPath).catch(() => undefined);
      return { id: String(doc._id), cached: true };
    }

    const doc = await this.model.create({
      user: userId,
      sourceName: originalName,
      sourceFormat: source,
      targetFormat: to,
      sourceHash: hash,
      status: 'queued',
      progress: 0,
      stage: 'في قائمة الانتظار',
      inputPath,
      outputFilename,
      expiresAt,
    });
    this.pump();
    return { id: String(doc._id), cached: false };
  }

  private async fileExists(p: string): Promise<boolean> {
    return stat(p).then((s) => s.isFile()).catch(() => false);
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    void (async () => {
      try {
        while (this.running < this.maxWorkers) {
          const job = await this.model
            .findOneAndUpdate(
              { status: 'queued' },
              { status: 'processing', progress: 3, stage: 'بدء المعالجة' },
              { sort: { createdAt: 1 }, new: true },
            )
            .exec()
            .catch(() => null);
          if (!job) break;
          this.running += 1;
          void this.process(job).finally(() => {
            this.running -= 1;
            this.pump();
          });
        }
      } finally {
        this.pumping = false;
      }
    })();
  }

  private async process(job: ConversionDocument): Promise<void> {
    const started = Date.now();
    const id = job._id;
    let lastWrite = 0;
    const onProgress = (percent: number, stage: string) => {
      const now = Date.now();
      if (now - lastWrite < 700) return; // throttle DB writes
      lastWrite = now;
      void this.model.updateOne({ _id: id }, { progress: Math.max(1, Math.min(99, Math.round(percent))), stage }).catch(() => undefined);
    };

    try {
      if (!job.inputPath) throw new Error('لا يوجد ملف مصدر');
      const input = await readFile(job.inputPath);
      const output = await runConversion(input, job.sourceFormat as any, job.targetFormat as any, onProgress);

      const userDir = join(this.outputRoot, String(job.user));
      await mkdir(userDir, { recursive: true });
      const outputPath = join(userDir, `${uuid()}.${job.targetFormat}`);
      await writeFile(outputPath, output);

      await this.model.updateOne(
        { _id: id },
        {
          status: 'done',
          progress: 100,
          stage: 'اكتمل',
          outputPath,
          sizeBytes: output.length,
          inputPath: null,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      );
      this.logger.log(`job ${id} ${job.sourceFormat}->${job.targetFormat} done in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`job ${id} ${job.sourceFormat}->${job.targetFormat} failed: ${message}`);
      await this.model
        .updateOne({ _id: id }, { status: 'failed', stage: '', error: 'تعذّر تحويل هذا الملف. قد يكون تالفًا أو محميًا بكلمة مرور.' })
        .catch(() => undefined);
    } finally {
      if (job.inputPath) await unlink(job.inputPath).catch(() => undefined);
    }
  }
}
