import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LectureFolderDocument = HydratedDocument<LectureFolder>;

// A named grouping for the PDF/video lecture library (components/lectures/). A lecture belongs to
// a folder purely by its `courseCode` matching this folder's `name` -- see
// PostsService.listLectureFolders()/browseAttachments(), so no back-reference is stored here.
@Schema({ timestamps: true })
export class LectureFolder {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, enum: ['lecture', 'video'] })
  attachmentType: 'lecture' | 'video';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  // Populated automatically by { timestamps: true } below -- declared here only so TS knows about
  // them on a hydrated document (e.g. PostsService.toLectureFolderDto()).
  createdAt: Date;
  updatedAt: Date;
}

export const LectureFolderSchema = SchemaFactory.createForClass(LectureFolder);
// Case-insensitive uniqueness per type, so "CS101" and "cs101" can't both exist as folders.
LectureFolderSchema.index(
  { attachmentType: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
