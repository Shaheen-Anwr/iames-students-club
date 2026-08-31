import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reel, ReelDocument } from './schemas/reel.schema';
import { ReelComment, ReelCommentDocument } from './schemas/reel-comment.schema';
import { CreateReelDto } from './dto/create-reel.dto';
import { StorageService } from '../upload/storage.service';
import { StreamService } from '../stream/stream.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { Role } from '../common/enums/role.enum';
import { Department } from '../common/enums/department.enum';
import { extractMentionIds, parseHashtags } from '../common/utils/tag-parser.util';
import { buildReelThumbnailUrl, cldVideoOptimize } from './reel-url.util';

// Playback-length ceiling for a reel. The browser blocks anything longer before upload; this is
// the server-side backstop, checked against Cloudinary's own reported duration. A little slack
// over 60 absorbs rounding / keyframe-aligned trims.
const MAX_REEL_DURATION_SEC = 61;

interface AuthorView {
  id: string;
  name: string;
  photoUrl: string | null;
  role: Role;
  collegeId: string | null;
}

export interface ReelView {
  id: string;
  author: AuthorView | null;
  // 'stream' -> `videoUrl` is an HLS manifest (.m3u8), play with hls.js on non-Safari.
  videoProvider: 'cloudinary' | 'stream';
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  durationSec: number;
  hashtags: string[];
  department: Department | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  createdAt: Date;
}

export interface ReelCommentView {
  id: string;
  author: AuthorView | null;
  text: string;
  edited: boolean;
  parent: string | null;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: Date;
}

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    @InjectModel(Reel.name) private readonly reelModel: Model<ReelDocument>,
    @InjectModel(ReelComment.name) private readonly commentModel: Model<ReelCommentDocument>,
    private readonly storageService: StorageService,
    private readonly streamService: StreamService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly gamificationService: GamificationService,
  ) {}

  // --- helpers -------------------------------------------------------------

  private async resolveMentions(text: string, authorId: string): Promise<Types.ObjectId[]> {
    const candidateIds = extractMentionIds(text).filter((id) => id !== authorId);
    if (!candidateIds.length) return [];
    const validIds = await this.usersService.findExistingIds(candidateIds);
    return validIds.map((id) => new Types.ObjectId(id));
  }

  private toAuthorView(author: unknown): AuthorView | null {
    const a = author as
      | { _id?: Types.ObjectId; name?: string; photoUrl?: string | null; role?: Role; collegeId?: string | null }
      | null
      | undefined;
    if (!a || !a._id) return null;
    return {
      id: a._id.toString(),
      name: a.name ?? 'مستخدم',
      photoUrl: a.photoUrl ?? null,
      role: a.role ?? Role.STUDENT,
      collegeId: a.collegeId ?? null,
    };
  }

  private toReelView(reel: ReelDocument, viewerId: string): ReelView {
    const vid = new Types.ObjectId(viewerId);
    const provider = reel.videoProvider ?? 'cloudinary';
    return {
      id: reel._id.toString(),
      author: this.toAuthorView(reel.author),
      videoProvider: provider,
      // cldVideoOptimize rewrites a Cloudinary /video/upload transform segment -- leave a Stream
      // HLS manifest URL untouched.
      videoUrl: provider === 'stream' ? reel.videoUrl : cldVideoOptimize(reel.videoUrl),
      thumbnailUrl: reel.thumbnailUrl,
      caption: reel.caption,
      durationSec: reel.durationSec,
      hashtags: reel.hashtags,
      department: reel.department,
      likeCount: reel.likeCount,
      commentCount: reel.commentCount,
      viewCount: reel.viewCount,
      likedByMe: reel.likes.some((u) => u.equals(vid)),
      savedByMe: reel.savedBy.some((u) => u.equals(vid)),
      createdAt: (reel as unknown as { createdAt: Date }).createdAt,
    };
  }

  private toCommentView(comment: ReelCommentDocument, viewerId: string): ReelCommentView {
    const vid = new Types.ObjectId(viewerId);
    return {
      id: comment._id.toString(),
      author: this.toAuthorView(comment.author),
      text: comment.text,
      edited: comment.edited,
      parent: comment.parent ? comment.parent.toString() : null,
      replyCount: comment.replyCount,
      likeCount: comment.likes.length,
      likedByMe: comment.likes.some((u) => u.equals(vid)),
      createdAt: (comment as unknown as { createdAt: Date }).createdAt,
    };
  }

  private async loadReel(id: string): Promise<ReelDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الريل غير موجود');
    const reel = await this.reelModel.findById(id).populate('author', 'name role photoUrl collegeId').exec();
    if (!reel) throw new NotFoundException('الريل غير موجود');
    return reel;
  }

  // --- create -----------------------------------------------------------------

  async create(userId: string, dto: CreateReelDto): Promise<ReelView> {
    let videoProvider: 'cloudinary' | 'stream' = 'cloudinary';
    let videoUid: string | null = null;
    let videoUrl: string;
    let thumbnailUrl: string;
    let chunkCount = dto.chunkCount ?? 1;
    let durationSec: number;

    if (dto.streamUid) {
      // Cloudflare Stream path: re-verify the uid server-side -- never trust the client's duration.
      if (!this.streamService.isConfigured) {
        throw new BadRequestException('رفع الفيديو عبر Cloudflare Stream غير مُفعّل');
      }
      const status = await this.streamService.getStatus(dto.streamUid);
      if (!status.ready) {
        throw new BadRequestException('الفيديو لا يزال قيد المعالجة، حاول مرة أخرى بعد قليل');
      }
      videoProvider = 'stream';
      videoUid = status.uid;
      videoUrl = status.playbackUrl;
      thumbnailUrl = status.thumbnailUrl;
      durationSec = status.durationSec;
      chunkCount = 1;
    } else if (dto.publicIds?.length) {
      const outcome = await this.storageService.confirmDirectUpload('videos', dto.publicIds);
      videoUrl = outcome.url;
      chunkCount = outcome.chunkCount;
      durationSec = outcome.durationSec ?? dto.durationSec ?? 0;
      thumbnailUrl = buildReelThumbnailUrl(videoUrl);
    } else if (dto.videoUrl && dto.videoUrl.includes('res.cloudinary.com') && dto.videoUrl.includes('/video/')) {
      videoUrl = dto.videoUrl;
      durationSec = dto.durationSec ?? 0;
      thumbnailUrl = buildReelThumbnailUrl(videoUrl);
    } else {
      throw new BadRequestException('لم يتم رفع الفيديو بشكل صحيح');
    }

    if (durationSec > MAX_REEL_DURATION_SEC) {
      throw new BadRequestException('الحد الأقصى لمدة الريلز ٦٠ ثانية');
    }

    const caption = (dto.caption ?? '').trim();
    const [mentions, author] = await Promise.all([
      this.resolveMentions(caption, userId),
      this.usersService.findById(userId),
    ]);

    const reel = await new this.reelModel({
      author: new Types.ObjectId(userId),
      videoProvider,
      videoUid,
      videoUrl,
      thumbnailUrl,
      caption,
      durationSec: Math.round(durationSec),
      chunkCount,
      hashtags: parseHashtags(caption),
      mentions,
      department: author.department ?? null,
      academicYear: author.academicYear ?? null,
      specialization: author.specialization ?? null,
    }).save();

    await this.gamificationService.awardPoints(userId, POINTS.REEL_CREATED).catch(() => {});

    for (const recipient of mentions) {
      await this.notificationsService
        .create({
          recipient,
          actor: userId,
          type: 'reel_mention',
          reelId: reel._id.toString(),
          preview: caption.slice(0, 120),
        })
        .catch(() => {});
    }

    await reel.populate('author', 'name role photoUrl collegeId');
    return this.toReelView(reel, userId);
  }

  // --- feed / read ----------------------------------------------------------

  async feed(
    viewerId: string,
    page = 1,
    limit = 10,
    authorId?: string,
    hashtag?: string,
  ): Promise<{ data: ReelView[]; page: number; limit: number; hasMore: boolean }> {
    const filter: Record<string, unknown> = {};
    if (authorId && Types.ObjectId.isValid(authorId)) filter.author = new Types.ObjectId(authorId);
    if (hashtag) filter.hashtags = hashtag.toLowerCase().replace(/^#/, '');

    const capped = Math.min(Math.max(limit, 1), 20);
    const reels = await this.reelModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * capped)
      .limit(capped + 1)
      .populate('author', 'name role photoUrl collegeId')
      .exec();

    const hasMore = reels.length > capped;
    return {
      data: reels.slice(0, capped).map((r) => this.toReelView(r, viewerId)),
      page,
      limit: capped,
      hasMore,
    };
  }

  async findOne(id: string, viewerId: string): Promise<ReelView> {
    return this.toReelView(await this.loadReel(id), viewerId);
  }

  // --- engagement ---------------------------------------------------------

  async toggleLike(id: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const reel = await this.loadReel(id);
    const uid = new Types.ObjectId(userId);
    const liked = reel.likes.some((u) => u.equals(uid));

    if (liked) {
      await this.reelModel.updateOne({ _id: reel._id }, { $pull: { likes: uid }, $inc: { likeCount: -1 } }).exec();
      return { liked: false, likeCount: Math.max(0, reel.likeCount - 1) };
    }

    await this.reelModel.updateOne({ _id: reel._id }, { $addToSet: { likes: uid }, $inc: { likeCount: 1 } }).exec();

    const authorId = this.toAuthorView(reel.author)?.id;
    if (authorId && authorId !== userId) {
      await this.notificationsService
        .create({ recipient: authorId, actor: userId, type: 'reel_like', reelId: reel._id.toString() })
        .catch(() => {});
    }
    return { liked: true, likeCount: reel.likeCount + 1 };
  }

  async toggleSave(id: string, userId: string): Promise<{ saved: boolean }> {
    const reel = await this.loadReel(id);
    const uid = new Types.ObjectId(userId);
    const saved = reel.savedBy.some((u) => u.equals(uid));
    await this.reelModel
      .updateOne({ _id: reel._id }, saved ? { $pull: { savedBy: uid } } : { $addToSet: { savedBy: uid } })
      .exec();
    return { saved: !saved };
  }

  async registerView(id: string): Promise<{ viewCount: number }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الريل غير موجود');
    const updated = await this.reelModel
      .findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true })
      .select('viewCount')
      .exec();
    if (!updated) throw new NotFoundException('الريل غير موجود');
    return { viewCount: updated.viewCount };
  }

  async remove(id: string, requester: { userId: string; role: Role }): Promise<void> {
    const reel = await this.loadReel(id);
    const authorId = this.toAuthorView(reel.author)?.id ?? reel.author?.toString();
    if (authorId !== requester.userId && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('يمكنك حذف الريلز الخاصة بك فقط');
    }
    await this.reelModel.deleteOne({ _id: reel._id }).exec();
    await this.commentModel.deleteMany({ reel: reel._id }).exec();
    // Best-effort -- freeing the hosted asset must never block the delete response.
    if (reel.videoProvider === 'stream' && reel.videoUid) {
      this.streamService
        .deleteVideo(reel.videoUid)
        .catch((err) => this.logger.warn(`Stream asset cleanup failed: ${err?.message ?? err}`));
    } else {
      this.storageService
        .destroyVideoByUrl(reel.videoUrl)
        .catch((err) => this.logger.warn(`Reel asset cleanup failed: ${err?.message ?? err}`));
    }
  }

  // --- comments ---------------------------------------------------------------

  async listComments(
    reelId: string,
    viewerId: string,
    page = 1,
    limit = 20,
    parent?: string,
  ): Promise<ReelCommentView[]> {
    await this.loadReel(reelId);
    const capped = Math.min(Math.max(limit, 1), 50);
    const comments = await this.commentModel
      .find({
        reel: new Types.ObjectId(reelId),
        parent: parent && Types.ObjectId.isValid(parent) ? new Types.ObjectId(parent) : null,
      })
      .sort({ createdAt: parent ? 1 : -1 })
      .skip((page - 1) * capped)
      .limit(capped)
      .populate('author', 'name role photoUrl collegeId')
      .exec();
    return comments.map((c) => this.toCommentView(c, viewerId));
  }

  async addComment(
    reelId: string,
    authorId: string,
    text: string,
    parentId?: string,
  ): Promise<ReelCommentView> {
    const reel = await this.loadReel(reelId);
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('التعليق لا يمكن أن يكون فارغًا');

    let parent: ReelCommentDocument | null = null;
    if (parentId) {
      parent = await this.commentModel.findById(parentId).exec();
      if (!parent || parent.reel.toString() !== reelId || parent.parent) {
        throw new BadRequestException('التعليق الأصلي غير موجود');
      }
    }

    const mentions = await this.resolveMentions(trimmed, authorId);
    const comment = await new this.commentModel({
      reel: reel._id,
      author: new Types.ObjectId(authorId),
      text: trimmed,
      parent: parent?._id ?? null,
      mentions,
    }).save();

    await this.reelModel.updateOne({ _id: reel._id }, { $inc: { commentCount: 1 } }).exec();
    if (parent) {
      await this.commentModel.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } }).exec();
    }

    const reelAuthorId = this.toAuthorView(reel.author)?.id;
    const notified = new Set<string>([authorId]);

    if (parent && parent.author.toString() !== authorId) {
      notified.add(parent.author.toString());
      await this.notificationsService
        .create({
          recipient: parent.author,
          actor: authorId,
          type: 'reel_comment_reply',
          reelId,
          preview: trimmed.slice(0, 120),
        })
        .catch(() => {});
    }

    if (reelAuthorId && !notified.has(reelAuthorId)) {
      notified.add(reelAuthorId);
      await this.notificationsService
        .create({ recipient: reelAuthorId, actor: authorId, type: 'reel_comment', reelId, preview: trimmed.slice(0, 120) })
        .catch(() => {});
    }

    for (const recipient of mentions) {
      if (notified.has(recipient.toString())) continue;
      await this.notificationsService
        .create({ recipient, actor: authorId, type: 'reel_mention', reelId, preview: trimmed.slice(0, 120) })
        .catch(() => {});
    }

    await comment.populate('author', 'name role photoUrl collegeId');
    return this.toCommentView(comment, authorId);
  }

  async toggleCommentLike(commentId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    if (!Types.ObjectId.isValid(commentId)) throw new NotFoundException('التعليق غير موجود');
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    const uid = new Types.ObjectId(userId);
    const liked = comment.likes.some((u) => u.equals(uid));
    await this.commentModel
      .updateOne({ _id: comment._id }, liked ? { $pull: { likes: uid } } : { $addToSet: { likes: uid } })
      .exec();
    return { liked: !liked, likeCount: comment.likes.length + (liked ? -1 : 1) };
  }

  async removeComment(commentId: string, requester: { userId: string; role: Role }): Promise<void> {
    if (!Types.ObjectId.isValid(commentId)) throw new NotFoundException('التعليق غير موجود');
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    if (comment.author.toString() !== requester.userId && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('يمكنك حذف تعليقاتك فقط');
    }

    // A top-level comment takes its whole reply subtree with it.
    const replyIds = comment.parent
      ? []
      : (await this.commentModel.find({ parent: comment._id }).select('_id').exec()).map((r) => r._id);
    const removedCount = 1 + replyIds.length;

    await this.commentModel.deleteMany({ _id: { $in: [comment._id, ...replyIds] } }).exec();
    await this.reelModel.updateOne({ _id: comment.reel }, { $inc: { commentCount: -removedCount } }).exec();
    if (comment.parent) {
      await this.commentModel.updateOne({ _id: comment.parent }, { $inc: { replyCount: -1 } }).exec();
    }
  }
}
