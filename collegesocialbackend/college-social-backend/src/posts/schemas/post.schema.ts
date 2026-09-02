import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Department } from '../../common/enums/department.enum';
import { AcademicYear } from '../../common/enums/academic-year.enum';
import { Specialization } from '../../common/enums/specialization.enum';

export type PostDocument = HydratedDocument<Post>;

export enum PostScope {
  PUBLIC = 'public',
  DEPARTMENT = 'department',
  // Audience-restricted posts. 'friends' is visible to the author + everyone in the author's
  // `friends` list; 'private' ("only me") is visible to the author alone. Unlike 'department',
  // neither is tied to a browse tag -- they're pure access control, enforced in
  // PostsService.feed()/canViewScope().
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

export enum PostAttachmentType {
  LECTURE = 'lecture',
  VIDEO = 'video',
  FILE = 'file',
  IMAGE = 'image',
  NONE = 'none',
}

export enum ReactionType {
  LIKE = 'like',
  DISLIKE = 'dislike',
  CARE = 'care',
  SUPPORT = 'support',
  NOT_INTERESTED = 'not_interested',
  SAD = 'sad',
  ANGRY = 'angry',
}

// Embedded, not its own collection/module -- one reaction per user per post, no need to query
// reactions independently of their post.
@Schema({ _id: false })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: ReactionType, required: true })
  type: ReactionType;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: false, trim: true, default: '' })
  caption: string;

  @Prop({ type: String, required: true, enum: PostAttachmentType, default: PostAttachmentType.NONE })
  attachmentType: PostAttachmentType;

  // Cloudinary secure_url, e.g. "https://res.cloudinary.com/<cloud>/raw/upload/.../lectures/<file>.pdf"
  @Prop({ type: String, required: false, default: null })
  attachmentUrl: string | null;

  @Prop({ type: String, required: false, default: null })
  attachmentOriginalName: string | null;

  // Bytes, from the upload response -- shown next to the filename on document/file attachment
  // cards. Not meaningful for 'image' (see `images` below) or when there's no attachment.
  @Prop({ type: Number, required: false, default: null })
  attachmentSize: number | null;

  // >1 only when the original file exceeded Cloudinary's per-asset cap (see StorageService.upload())
  // and was split into multiple assets named "<base>-part-0", "-part-1", etc. -- attachmentUrl still
  // points at part 0. For 'lecture'/'file' (raw) attachments, PostsController's GET :id/attachment
  // derives and re-streams the remaining parts as one continuous file; for 'video', no special
  // handling is needed since attachmentUrl is already a Cloudinary splice/concatenation URL that
  // plays all parts as a single video. null/1 means a normal, unsplit upload.
  @Prop({ type: Number, required: false, default: null })
  attachmentChunkCount: number | null;

  // Only populated when attachmentType is 'image' -- a Facebook-style multi-photo post. Every
  // other attachment type carries exactly one file via attachmentUrl above.
  @Prop({ type: [String], default: [] })
  images: string[];

  // Set true once the author edits the caption after creation -- surfaced as an "edited" tag.
  @Prop({ default: false })
  edited: boolean;

  // Set only on a share (see PostsService.share()); null for a regular post. Always points at the
  // ORIGINAL post even when sharing a share, so share chains never nest more than one level deep.
  @Prop({ type: Types.ObjectId, ref: 'Post', default: null, index: true })
  sharedFrom: Types.ObjectId | null;

  // Denormalized count of posts that share this one (only meaningful when sharedFrom is null).
  @Prop({ default: 0 })
  shareCount: number;

  // Derived server-side from `caption` on create/update -- see common/utils/tag-parser.util.ts.
  // Lowercased, deduped, no leading '#'.
  @Prop({ type: [String], default: [], index: true })
  hashtags: string[];

  // Derived server-side from `caption` on create/update, filtered to ids that resolve to a real
  // user -- see common/utils/tag-parser.util.ts.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];

  // Optional: restrict a post to a course/class code, e.g. "CS101"
  @Prop({ type: String, required: false, default: null, trim: true, index: true })
  courseCode: string | null;

  @Prop({ type: String, enum: PostScope, required: true, default: PostScope.PUBLIC, index: true })
  scope: PostScope;

  // Snapshotted from the author's profile at creation time (or, for a lecture/video library
  // upload, an explicit tag chosen on the upload form instead -- independent of the author's own
  // profile, since those uploads are always 'public'). Purely a browse/filter tag, never access
  // control except department while scope is 'department'. See PostsService.create().
  @Prop({ type: String, enum: Department, default: null, index: true })
  department: Department | null;

  @Prop({ type: String, enum: AcademicYear, default: null, index: true })
  academicYear: AcademicYear | null;

  @Prop({ type: String, enum: Specialization, default: null, index: true })
  specialization: Specialization | null;

  // One reaction per user per post -- see ReactionType/Reaction above.
  @Prop({ type: [ReactionSchema], default: [] })
  reactions: Reaction[];

  // `ref` must sit at this outer level, not nested inside the array's object literal -- see the
  // NOTE in chat/schemas/conversation.schema.ts's `participants` prop for why.
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  savedBy: Types.ObjectId[];

  // Denormalized to avoid an N+1 count query per feed item.
  @Prop({ default: 0 })
  commentCount: number;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ caption: 'text' });
// The individual per-field indexes above (scope/department/etc.) each help their own equality
// filter, but every feed query also sorts by `createdAt` -- without an index covering that,
// MongoDB has to collect every matching document and sort in memory instead of reading them back
// pre-sorted, which gets slower as the collection grows regardless of how selective the filter is.
// These compound indexes cover PostsService.feed()'s two actual shapes (the department-scoped feed,
// and everything else -- public feed, profile feed, course/attachment browsing, etc.) with the sort
// field last, plus a savedBy index for findSaved() (savedBy is an array, so this is a multikey
// index) and a plain createdAt index as a fallback for any other sort-by-recency query.
PostSchema.index({ scope: 1, department: 1, createdAt: -1 });
PostSchema.index({ scope: 1, createdAt: -1 });
// Academic-year priority tier (see PostsService.feed()): the main "عام" feed and the شعبة feed put
// the viewer's own academicYear (plus untagged posts) ahead of every other year's. This covers the
// hot own-year page fetch + its countDocuments; the rest-of-years tier ($nin) is a rare deep-scroll
// and falls back to the indexes above.
PostSchema.index({ scope: 1, department: 1, academicYear: 1, createdAt: -1 });
// Profile feed: one author's posts narrowed to the audiences the viewer may see (scope $in),
// newest first -- see PostsService.feed()'s profile branch. Also covers the main feed's
// "friends-scoped posts by people I'm friends with" $or clause (author $in + scope equality).
PostSchema.index({ author: 1, scope: 1, createdAt: -1 });
PostSchema.index({ savedBy: 1, createdAt: -1 });
PostSchema.index({ createdAt: -1 });
