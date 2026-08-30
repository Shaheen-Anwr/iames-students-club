import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';

export type WallPostDocument = HydratedDocument<WallPost>;

// One anonymous post on the "الجدار" (campus wall). The real author is kept for rate-limiting,
// moderation and "delete my own" but is NEVER returned to clients -- the only public identity is
// `authorHash`, a stable one-way pseudonym so a student recognises their own posts without anyone
// being able to reverse it to a name.
@Schema({ timestamps: true })
export class WallPost {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  // First 8 hex of sha256(userId + server secret). Same user -> same hash, forever.
  @Prop({ type: String, required: true, index: true })
  authorHash: string;

  // شعبة scoping, identical rule to posts/announcements: null = college-wide, else that dept only.
  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ type: String, required: true, trim: true })
  body: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  likes: Types.ObjectId[];

  // Denormalised WallComment count so list() doesn't need an aggregate per post.
  @Prop({ type: Number, default: 0 })
  commentCount: number;

  // Distinct users who reported this post. At WALL_AUTO_HIDE_REPORTS the post auto-hides
  // (moderationNote records it) until an admin reviews.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  reports: Types.ObjectId[];

  // Set on auto-hide (enough reports) or an explicit admin hide -- hidden rows are dropped from
  // every list() but kept for audit. `moderationNote` is admin-facing only.
  @Prop({ type: Boolean, default: false, index: true })
  hidden: boolean;

  @Prop({ type: String, default: null })
  moderationNote: string | null;
}

export const WallPostSchema = SchemaFactory.createForClass(WallPost);
WallPostSchema.index({ hidden: 1, department: 1, createdAt: -1 });
