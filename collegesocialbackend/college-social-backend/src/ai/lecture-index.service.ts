import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PDFParse } from 'pdf-parse';
import { LectureChunk, LectureChunkDocument } from './schemas/lecture-chunk.schema';
import { StorageService } from '../upload/storage.service';
import { Department } from '../common/enums/department.enum';

const CHUNK_SIZE = 1000;

export interface LectureIndexStats {
  totalChunks: number;
  indexedSources: number;
  byDepartment: Record<string, number>;
}

interface IndexLectureInput {
  sourceType: 'post' | 'assignment';
  sourceId: string;
  attachmentType: string;
  attachmentUrl: string | null;
  attachmentOriginalName: string | null;
  courseCode: string | null;
  department: Department | null;
}

// Extracts text from a newly-created lecture attachment and chunks it for LectureSearchService.
// PDF-only for now -- other lecture formats (.pptx/.docx) are explicitly out of scope for
// extraction in this pass and are skipped with a logged reason, not silently ignored. Called
// fire-and-forget from PostsService.create/AssignmentsService.create: a failed extraction just
// means that lecture isn't searchable yet, never a user-facing error.
@Injectable()
export class LectureIndexService {
  private readonly logger = new Logger(LectureIndexService.name);

  constructor(
    @InjectModel(LectureChunk.name) private chunkModel: Model<LectureChunkDocument>,
    private readonly storageService: StorageService,
  ) {}

  // Fetches a previously-uploaded PDF's bytes and extracts its text. Returns null if the bytes
  // can't be fetched (Cloudinary not configured, URL mismatch) -- never throws for that case, since
  // callers (indexing here, and the AI assistant's document-attachment path) treat a missing file
  // as "nothing to extract", not an error. A genuine parse failure still throws, same as before.
  async extractPdfText(url: string): Promise<string | null> {
    const buffer = await this.storageService.getObject(url);
    if (!buffer) return null;

    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  async indexIfLecture(input: IndexLectureInput): Promise<void> {
    if (input.attachmentType !== 'lecture' || !input.attachmentUrl) return;

    if (!input.attachmentOriginalName?.toLowerCase().endsWith('.pdf')) {
      this.logger.log(
        `Skipping lecture index for ${input.sourceType} ${input.sourceId}: only PDF text extraction is supported currently (got "${input.attachmentOriginalName}")`,
      );
      return;
    }

    try {
      const extractedText = await this.extractPdfText(input.attachmentUrl);
      if (extractedText === null) {
        this.logger.warn(`Could not fetch lecture bytes for ${input.sourceType} ${input.sourceId} -- Cloudinary not configured or URL mismatch`);
        return;
      }

      const chunks = this.chunkText(extractedText);
      if (chunks.length === 0) return;

      const sourceId = new Types.ObjectId(input.sourceId);
      // Idempotent: re-indexing (e.g. a retry) replaces any previous chunks for this source.
      await this.chunkModel.deleteMany({ sourceType: input.sourceType, sourceId }).exec();
      await this.chunkModel.insertMany(
        chunks.map((text, chunkIndex) => ({
          sourceType: input.sourceType,
          sourceId,
          courseCode: input.courseCode,
          department: input.department,
          text,
          chunkIndex,
        })),
      );
      this.logger.log(`Indexed ${chunks.length} chunk(s) for ${input.sourceType} ${input.sourceId}`);
    } catch (err) {
      this.logger.warn(`Lecture indexing failed for ${input.sourceType} ${input.sourceId}: ${(err as Error).message}`);
    }
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async getStats(): Promise<LectureIndexStats> {
    const [totalChunks, distinctSources, byDepartmentRows] = await Promise.all([
      this.chunkModel.countDocuments().exec(),
      this.chunkModel.distinct('sourceId').exec(),
      this.chunkModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { department: { $ne: null } } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    return {
      totalChunks,
      indexedSources: distinctSources.length,
      byDepartment: Object.fromEntries(byDepartmentRows.map((r) => [r._id, r.count])),
    };
  }

  private chunkText(text: string): string[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const chunks: string[] = [];
    for (let i = 0; i < cleaned.length; i += CHUNK_SIZE) {
      chunks.push(cleaned.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
  }
}
