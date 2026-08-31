import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type ReelDocument = HydratedDocument<Reel>;

// One short vertical video in the "اكاديميا" (Academia Reels) section -- a TikTok-style feed any
// user can post to. The video bytes go straight from the browser to Cloudinary (see the frontend's
// lib/cloudinary-upload.ts + StorageService.confirmDirectUpload); only the resulting canonical URL
// is stored here. Hard-capped at 60s of playback, enforced both in the browser and again in
// ReelsService.create() from Cloudinary's reported duration.
@Schema({ timestamps: true })
export class Reel {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  // Which backend hosts the video. 'cloudinary' (default, every pre-Stream reel) -> `videoUrl` is
  // a Cloudinary secure_url / fl_splice URL. 'stream' -> `videoUrl` is a Cloudflare Stream HLS
  // manifest (.m3u8) and `videoUid` is set. See StreamService.
  @Prop({ type: String, enum: ['cloudinary', 'stream'], default: 'cloudinary' })
  videoProvider: 'cloudinary' | 'stream';

  // Cloudflare Stream video id -- set only when videoProvider === 'stream'. Used for delete cleanup.
  @Prop({ type: String, default: null })
  videoUid: string | null;

  // For 'cloudinary': a plain secure_url or an fl_splice delivery URL. For 'stream': the HLS
  // manifest URL (.m3u8).
  @Prop({ type: String, required: true })
  videoUrl: string;

  // Derived from videoUrl at create time (see buildReelThumbnailUrl) -- a single JPEG frame used
  // as the <video> poster so the feed paints instantly before playback starts.
  @Prop({ type: String, required: true })
  thumbnailUrl: string;

  @Prop({ type: String, default: '', trim: true })
  caption: string;

  // Seconds of playback, from Cloudinary. Always <= 60 (create() rejects anything longer).
  @Prop({ type: Number, required: true })
  durationSec: number;

  // >1 only when the source exceeded Cloudinary's per-asset cap and was segmented -- videoUrl is
  // already a splice URL in that case, so this is informational / used on delete cleanup.
  @Prop({ type: Number, default: 1 })
  chunkCount: number;

  // Derived server-side from `caption` (see common/utils/tag-parser.util.ts). Lowercased, deduped.
  @Prop({ type: [String], default: [], index: true })
  hashtags: string[];

  // Derived server-side from `caption`, filtered to ids that resolve to a real user.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];

  // Snapshotted from the author's profile at creation -- pure browse/relevance tags for a future
  // "For You" ranking, never access control (every reel is public).
  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ type: String, enum: AcademicYear, default: null })
  academicYear: AcademicYear | null;

  @Prop({ type: String, enum: Specialization, default: null })
  specialization: Specialization | null;

  // Simple one-like-per-user (not the multi-reaction model posts use). likeCount is denormalized.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  likes: Types.ObjectId[];

  @Prop({ type: Number, default: 0 })
  likeCount: number;

  @Prop({ type: Number, default: 0 })
  commentCount: number;

  @Prop({ type: Number, default: 0 })
  viewCount: number;

  // `ref` at this outer level, not nested in the array literal -- same Mongoose caveat noted in
  // posts/post.schema.ts's savedBy.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  savedBy: Types.ObjectId[];
}

export const ReelSchema = SchemaFactory.createForClass(Reel);
// Feed is newest-first; the compound indexes cover the "all reels" and "one author" shapes with
// the sort field last so MongoDB reads them back pre-sorted.
ReelSchema.index({ createdAt: -1 });
ReelSchema.index({ author: 1, createdAt: -1 });
ReelSchema.index({ hashtags: 1, createdAt: -1 });
ReelSchema.index({ savedBy: 1, createdAt: -1 });
