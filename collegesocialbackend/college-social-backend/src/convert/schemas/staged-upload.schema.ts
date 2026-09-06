import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StagedUploadDocument = HydratedDocument<StagedUpload>;

// A PDF a user uploaded to the visual page editor (reorder/rotate/pages/split) before choosing what
// to do with it. Short-lived by design: thumbnails are generated from `storedPath` on demand
// (ConvertToolsController), and finalizing exactly one action moves the file into a normal
// Conversion.inputPath and deletes this row -- staging is single-use. ConvertCleanupService.sweepStaged
// removes the underlying file for anything that expires unused.
@Schema({ timestamps: true })
export class StagedUpload {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  storedPath: string;

  @Prop({ required: true })
  pageCount: number;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ required: true })
  expiresAt: Date;
}

export const StagedUploadSchema = SchemaFactory.createForClass(StagedUpload);
StagedUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StagedUploadSchema.index({ user: 1, createdAt: -1 });
