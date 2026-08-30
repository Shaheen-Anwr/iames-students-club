import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WallCommentDocument = HydratedDocument<WallComment>;

// An anonymous reply on a wall post. Same identity model as WallPost -- `authorId` is kept for
// "delete my own" and rate-limit but never returned; `authorHash` is the stable pseudonym.
@Schema({ timestamps: true })
export class WallComment {
  @Prop({ type: Types.ObjectId, ref: 'WallPost', required: true, index: true })
  post: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  authorHash: string;

  @Prop({ type: String, required: true, trim: true })
  body: string;
}

export const WallCommentSchema = SchemaFactory.createForClass(WallComment);
WallCommentSchema.index({ post: 1, createdAt: 1 });
