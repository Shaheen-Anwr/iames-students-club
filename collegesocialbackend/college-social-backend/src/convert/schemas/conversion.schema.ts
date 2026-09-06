import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversionDocument = HydratedDocument<Conversion>;

export type ConversionStatus = 'queued' | 'processing' | 'done' | 'failed';

// One conversion job. Created immediately when a file is uploaded (status 'queued') and worked by
// ConvertQueueService in the background, so the HTTP request never blocks on a 2-minute Adobe run.
// The output file lives under <uploadsDir>/conversions/<userId>/<uuid>.<ext>; `expiresAt` carries a
// TTL index (Mongo drops the row ~24h out) and ConvertCleanupService sweeps the orphaned file.
@Schema({ timestamps: true })
export class Conversion {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  // Original upload filename, e.g. "الفصل-الأول.docx" -- shown in the history list.
  @Prop({ required: true })
  sourceName: string;

  // Canonical source/target extensions (no dot, lower-case), e.g. "docx" -> "pdf".
  @Prop({ required: true })
  sourceFormat: string;

  @Prop({ required: true })
  targetFormat: string;

  // sha256 of the uploaded bytes -- lets an identical (file, target) request reuse a finished
  // result instead of re-running the engine.
  @Prop({ type: String, default: null, index: true })
  sourceHash: string | null;

  @Prop({ type: String, enum: ['queued', 'processing', 'done', 'failed'], default: 'queued', index: true })
  status: ConversionStatus;

  // 0-100, updated live by the worker.
  @Prop({ type: Number, default: 0 })
  progress: number;

  // Short Arabic label of the current step ("جارٍ التحويل في Adobe", "تحسين النص العربي", ...).
  @Prop({ type: String, default: '' })
  stage: string;

  // Multer temp file, read by the worker then deleted (null once the job leaves 'queued'/'processing').
  @Prop({ type: String, default: null })
  inputPath: string | null;

  // Download filename handed to the browser (source basename + new extension).
  @Prop({ required: true })
  outputFilename: string;

  // Absolute path on the local/persistent disk -- set when status becomes 'done'.
  @Prop({ type: String, default: null })
  outputPath: string | null;

  @Prop({ type: Number, default: 0 })
  sizeBytes: number;

  // true when the output was cloned from a previous identical conversion (no engine run).
  @Prop({ type: Boolean, default: false })
  cached: boolean;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ required: true })
  expiresAt: Date;

  // 'convert' = plain format conversion (the original feature). Anything else is a PDF tool
  // (merge/images-to-pdf/split/reorder/rotate/pages/compress/protect/remove-password/watermark/ocr)
  // -- see engines/pdf-tools.engine.ts's runPdfTool() dispatcher.
  @Prop({ type: String, default: 'convert' })
  tool: string;

  // Merge/images-to-pdf only -- several input files in order. `inputPath` above stays the single-
  // input case for every other tool and for plain conversion.
  @Prop({ type: [String], default: null })
  inputPaths: string[] | null;

  // Tool-specific arguments (rotation map, page order/selection, password, watermark text/opacity,
  // OCR language, compress level). Opaque here -- each tool's own DTO validates its shape.
  @Prop({ type: Object, default: null })
  params: Record<string, unknown> | null;

  // True when the output is a zip of several files (split, pdf->images) -- set once at job-creation
  // time from a static shape table, never derived from the runtime file count, so a split into
  // exactly 1 piece still downloads as a .zip like every other split.
  @Prop({ type: Boolean, default: false })
  outputIsZip: boolean;
}

export const ConversionSchema = SchemaFactory.createForClass(Conversion);
ConversionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ConversionSchema.index({ user: 1, createdAt: -1 });
// Cache lookups + the queue's "claim next queued job" query.
ConversionSchema.index({ sourceHash: 1, targetFormat: 1, status: 1 });
ConversionSchema.index({ status: 1, createdAt: 1 });
