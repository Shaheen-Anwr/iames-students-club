import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiMemoryFactDocument = HydratedDocument<AiMemoryFact>;

// A small, durable fact the AI assistant learned about a student (e.g. "طالب هندسة حاسوب، سنة
// ثالثة"), written via the remember_about_me tool and read back into every future conversation --
// see AiMemoryService. Deliberately a flat string per fact, not structured: this stack has no
// embeddings/vector store, so there's no semantic dedupe, just a recency cap (see AiMemoryService).
@Schema({ timestamps: true })
export class AiMemoryFact {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  fact: string;
}

export const AiMemoryFactSchema = SchemaFactory.createForClass(AiMemoryFact);
