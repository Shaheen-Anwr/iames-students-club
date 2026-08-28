import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReelCommentDocument = HydratedDocument<ReelComment>;

// A comment on a reel. Flat with one level of replies (parent points at a top-level comment),
// mirroring posts/schemas/comment.schema.ts but without the multi-reaction model -- reel comments
// just have a plain like list.
@Schema({ timestamps: true })
export class ReelComment {
  @Prop({ type: Types.ObjectId, ref: 'Reel', required: true, index: true })
  reel: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: false })
  edited: boolean;

  // Null for a top-level comment; set to the top-level comment a reply belongs to (replies do not
  // nest past one level).
  @Prop({ type: Types.ObjectId, ref: 'ReelComment', default: null, index: true })
  parent: Types.ObjectId | null;

  @Prop({ default: 0 })
  replyCount: number;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  likes: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];
}

export const ReelCommentSchema = SchemaFactory.createForClass(ReelComment);
ReelCommentSchema.index({ reel: 1, parent: 1, createdAt: 1 });
