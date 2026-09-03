import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LectureNote, LectureNoteDocument } from './lecture-note.schema';

@Injectable()
export class LectureNotesService {
  constructor(@InjectModel(LectureNote.name) private readonly model: Model<LectureNoteDocument>) {}

  async get(userId: string, postId: string): Promise<{ body: string; updatedAt: string | null }> {
    if (!Types.ObjectId.isValid(postId)) throw new BadRequestException('معرّف غير صالح');
    const note = await this.model
      .findOne({ user: new Types.ObjectId(userId), post: new Types.ObjectId(postId) })
      .lean()
      .exec();
    return { body: note?.body ?? '', updatedAt: note?.updatedAt ? new Date(note.updatedAt).toISOString() : null };
  }

  // Upsert; an empty/whitespace body removes the note.
  async put(userId: string, postId: string, body: string): Promise<{ body: string; updatedAt: string | null }> {
    if (!Types.ObjectId.isValid(postId)) throw new BadRequestException('معرّف غير صالح');
    const uid = new Types.ObjectId(userId);
    const pid = new Types.ObjectId(postId);
    const trimmed = (body ?? '').trim().slice(0, 5000);
    if (!trimmed) {
      await this.model.deleteOne({ user: uid, post: pid }).exec();
      return { body: '', updatedAt: null };
    }
    const note = await this.model
      .findOneAndUpdate({ user: uid, post: pid }, { $set: { body: trimmed } }, { upsert: true, new: true })
      .lean()
      .exec();
    return { body: note?.body ?? trimmed, updatedAt: note?.updatedAt ? new Date(note.updatedAt).toISOString() : null };
  }
}
