import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Reaction, ReactionSchema } from './post.schema';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true, index: true })
  post: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true })
  text: string;

  // Set true once the author edits the text after creation -- surfaced as an "edited" tag.
  @Prop({ default: false })
  edited: boolean;

  // Null for a top-level comment. Set for a reply, pointing at the comment (top-level or itself a
  // reply) it replies to -- replies nest indefinitely by chaining this reference.
  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null, index: true })
  parentComment: Types.ObjectId | null;

  // Denormalized count of direct replies, mirroring Post.commentCount.
  @Prop({ default: 0 })
  replyCount: number;

  // Derived server-side from `text` on create/update, filtered to ids that resolve to a real user
  // -- see common/utils/tag-parser.util.ts.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];

  // Same one-reaction-per-user pattern as Post.reactions -- see post.schema.ts.
  @Prop({ type: [ReactionSchema], default: [] })
  reactions: Reaction[];
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ text: 'text' });
