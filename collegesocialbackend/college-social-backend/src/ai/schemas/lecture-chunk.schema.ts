import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type LectureChunkDocument = HydratedDocument<LectureChunk>;

// A ~1000-character slice of extracted text from a lecture PDF, indexed for keyword search
// (see LectureSearchService). Real, working search today -- only the "AI writes an explanation
// of the matched text" half (AiService) is stubbed pending an OpenAI key.
@Schema({ timestamps: true })
export class LectureChunk {
  @Prop({ required: true, enum: ['post', 'assignment'] })
  sourceType: 'post' | 'assignment';

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sourceId: Types.ObjectId;

  @Prop({ type: String, default: null, trim: true, index: true })
  courseCode: string | null;

  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  chunkIndex: number;
}

export const LectureChunkSchema = SchemaFactory.createForClass(LectureChunk);
LectureChunkSchema.index({ text: 'text' });
