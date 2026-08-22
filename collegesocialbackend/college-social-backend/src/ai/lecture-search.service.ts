import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LectureChunk, LectureChunkDocument } from './schemas/lecture-chunk.schema';
import { Department } from '../common/enums/department.enum';

const MAX_MATCHES = 5;

// Real, working $text search over indexed lecture chunks -- no external API needed. AiService
// feeds the matched excerpts to the model (or the stub) as context so it can "explain" them.
@Injectable()
export class LectureSearchService {
  constructor(@InjectModel(LectureChunk.name) private chunkModel: Model<LectureChunkDocument>) {}

  async search(query: string, viewerDepartment?: Department | null): Promise<LectureChunkDocument[]> {
    return this.chunkModel
      .find({
        $text: { $search: query },
        $or: [{ department: null }, { department: viewerDepartment ?? null }],
      })
      .limit(MAX_MATCHES)
      .exec();
  }
}
