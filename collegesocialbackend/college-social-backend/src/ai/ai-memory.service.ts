import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiMemoryFact, AiMemoryFactDocument } from './schemas/ai-memory-fact.schema';

const MAX_FACTS_PER_OWNER = 50;

// Persists small, student-authored facts across separate AI conversations (e.g. "طالب هندسة
// حاسوب، سنة ثالثة") -- written by the model itself via the remember_about_me tool (AiToolsService),
// read back into AiConversationsService's context on every turn, same plumbing as the schedule
// block. Bounded per-owner (like ScheduleContextService's dataset), so a simple recency cap is
// the pragmatic bound rather than any embedding-based relevance ranking.
@Injectable()
export class AiMemoryService {
  constructor(@InjectModel(AiMemoryFact.name) private memoryModel: Model<AiMemoryFactDocument>) {}

  async remember(ownerId: string, fact: string): Promise<void> {
    const owner = new Types.ObjectId(ownerId);
    await new this.memoryModel({ owner, fact }).save();

    const count = await this.memoryModel.countDocuments({ owner }).exec();
    if (count > MAX_FACTS_PER_OWNER) {
      const excess = await this.memoryModel
        .find({ owner })
        .sort({ createdAt: 1 })
        .limit(count - MAX_FACTS_PER_OWNER)
        .select('_id')
        .exec();
      await this.memoryModel.deleteMany({ _id: { $in: excess.map((f) => f._id) } }).exec();
    }
  }

  async listForOwner(ownerId: string): Promise<AiMemoryFactDocument[]> {
    return this.memoryModel.find({ owner: new Types.ObjectId(ownerId) }).sort({ createdAt: 1 }).exec();
  }

  async forgetAll(ownerId: string): Promise<void> {
    await this.memoryModel.deleteMany({ owner: new Types.ObjectId(ownerId) }).exec();
  }
}
