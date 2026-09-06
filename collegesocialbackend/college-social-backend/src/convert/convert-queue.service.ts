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
import { ALWAYS_ZIP_TARGETS, buildOutputName, FORMATS, isSupportedPair, normalizeFormat } from './formats';
import { runConversion } from './engines';
import { runPdfTool, type PdfTool, type PdfToolParams } from './engines/pdf-tools.engine';
import { zipBuffers } from './engines/zip.util';
import { adobeAvailable, compressPdfViaAdobe, protectPdf, removeProtection } from './engines/adobe.engine';
import { compressPdfViaGhostscript, gsAvailable, type CompressLevel } from './engines/ghostscript.engine';
import { ocrPdf, type OcrLanguage } from './engines/ocr.engine';
import type { ProgressFn } from './formats';

export type AnyTool = PdfTool | 'protect' | 'remove-password' | 'compress' | 'ocr';
export type AnyToolParams = PdfToolParams & { password?: string; level?: CompressLevel; language?: OcrLanguage };

// Dispatches every non-'convert' job. protect/remove-password go through Adobe (no pure-JS
// alternative exists -- see adobe.engine.ts); compress prefers Ghostscript (no quota, safe for
// Arabic text -- see ghostscript.engine.ts) with Adobe as the fallback; everything else is pdf-lib
// via runPdfTool.
async function runAnyTool(
  tool: string,
  inputs: Buffer[],
  params: AnyToolParams,
  onProgress: ProgressFn,
): Promise<Buffer | Buffer[]> {
  if (tool === 'protect' || tool === 'remove-password') {
    if (!adobeAvailable()) throw new Error('هذه الأداة تتطلّب اتصال Adobe غير المتوفر حاليًا');
    if (!params.password?.trim()) throw new Error('كلمة المرور مطلوبة');
    return tool === 'protect' ? protectPdf(inputs[0], params.password, onProgress) : removeProtection(inputs[0], params.password, onProgress);
  }
  if (tool === 'compress') {
    const level = params.level ?? 'medium';
    if (await gsAvailable()) {
      onProgress(15, 'جارٍ الضغط');
      return compressPdfViaGhostscript(inputs[0], level);
    }
    if (adobeAvailable()) return compressPdfViaAdobe(inputs[0], level, onProgress);
    throw new Error('ضغط الملفات غير متاح حاليًا');
  }
  if (tool === 'ocr') return ocrPdf(inputs[0], params.language ?? 'ara+eng', onProgress);
  return runPdfTool(tool as PdfTool, inputs, params, onProgress);
}

// Tools whose output is always a zip (even for a single resulting file) -- fixed at job-creation
// time, never derived from the runtime file count, so download logic branches on the tool, not on
// "how many pieces did this particular input produce".
const ZIP_OUTPUT_TOOLS = new Set<string>(['split', 'pdf-images']);

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
    const outputIsZip = ALWAYS_ZIP_TARGETS.has(to);
    const outputFilename = buildOutputName(originalName, outputIsZip ? 'zip' : to);
    const outputExt = outputIsZip ? 'zip' : to;
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
      const outputPath = join(userDir, `${uuid()}.${outputExt}`);
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
        outputIsZip,
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
      outputIsZip,
      expiresAt,
    });
    this.pump();
    return { id: String(doc._id), cached: false };
  }

  /**
   * Register a PDF-tool job (merge/images-to-pdf/split/reorder/rotate/pages/watermark -- anything
   * that isn't a plain format conversion). Unlike enqueue(), this never checks the sha256 cache:
   * two different rotation angles (or watermark texts, or page orders) on the same source bytes
   * must never collide on a cache key the way an identical plain conversion request can.
   */
  async enqueueTool(
    userId: string,
    tool: AnyTool,
    inputPaths: string[],
    originalName: string,
    params: AnyToolParams,
  ): Promise<{ id: string }> {
    const outputIsZip = ZIP_OUTPUT_TOOLS.has(tool);
    const outputFilename = outputIsZip ? buildOutputName(originalName, 'zip') : buildOutputName(originalName, 'pdf');
    const expiresAt = new Date(Date.now() + 24 * 3600_000);

    const doc = await this.model.create({
      user: userId,
      sourceName: originalName,
      sourceFormat: 'pdf',
      targetFormat: 'pdf',
      sourceHash: null,
      status: 'queued',
      progress: 0,
      stage: 'في قائمة الانتظار',
      inputPath: inputPaths.length === 1 ? inputPaths[0] : null,
      inputPaths: inputPaths.length > 1 ? inputPaths : null,
      outputFilename,
      tool,
      params,
      outputIsZip,
      expiresAt,
    });
    this.pump();
    return { id: String(doc._id) };
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

    const isTool = !!job.tool && job.tool !== 'convert';
    const label = isTool ? job.tool : `${job.sourceFormat}->${job.targetFormat}`;

    try {
      const paths = job.inputPaths?.length ? job.inputPaths : job.inputPath ? [job.inputPath] : [];
      if (!paths.length) throw new Error('لا يوجد ملف مصدر');

      let outputExt: string;
      let sizeBytes: number;
      let outputPath: string;
      const userDir = join(this.outputRoot, String(job.user));
      await mkdir(userDir, { recursive: true });

      if (isTool) {
        const inputs = await Promise.all(paths.map((p) => readFile(p)));
        const result = await runAnyTool(job.tool, inputs, (job.params as AnyToolParams) ?? {}, onProgress);
        const output = Array.isArray(result)
          ? zipBuffers(result.map((data, i) => ({ name: `${i + 1}.pdf`, data })))
          : result;
        outputExt = job.outputIsZip ? 'zip' : 'pdf';
        outputPath = join(userDir, `${uuid()}.${outputExt}`);
        await writeFile(outputPath, output);
        sizeBytes = output.length;
      } else {
        const input = await readFile(paths[0]);
        const output = await runConversion(input, job.sourceFormat as any, job.targetFormat as any, onProgress);
        outputExt = job.outputIsZip ? 'zip' : job.targetFormat;
        outputPath = join(userDir, `${uuid()}.${outputExt}`);
        await writeFile(outputPath, output);
        sizeBytes = output.length;
      }

      await this.model.updateOne(
        { _id: id },
        {
          status: 'done',
          progress: 100,
          stage: 'اكتمل',
          outputPath,
          sizeBytes,
          inputPath: null,
          inputPaths: null,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      );
      this.logger.log(`job ${id} ${label} done in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`job ${id} ${label} failed: ${message}`);
      await this.model
        .updateOne({ _id: id }, { status: 'failed', stage: '', error: 'تعذّر تنفيذ العملية. قد يكون الملف تالفًا أو محميًا بكلمة مرور.' })
        .catch(() => undefined);
    } finally {
      if (job.inputPath) await unlink(job.inputPath).catch(() => undefined);
      if (job.inputPaths?.length) await Promise.all(job.inputPaths.map((p) => unlink(p).catch(() => undefined)));
    }
  }
}
