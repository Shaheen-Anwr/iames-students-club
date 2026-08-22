import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostAttachmentType, PostDocument, PostScope, ReactionType } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { SharePostDto } from './dto/share-post.dto';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { NotificationsService } from '../notifications/notifications.service';
import { Department } from '../common/enums/department.enum';
import { AcademicYear, getAcademicYearsForDepartment } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';
import { LectureIndexService } from '../ai/lecture-index.service';
import { DailyCount, daysAgoStart, fillDailyCounts } from '../common/utils/daily-counts.util';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UsersService } from '../users/users.service';
import { extractMentionIds, parseHashtags } from '../common/utils/tag-parser.util';
import { Role } from '../common/enums/role.enum';

// Uploading course material (a lecture/video/file attachment) is admin/professor only; a plain
// caption/image post stays open to everyone.
const MATERIAL_ATTACHMENT_TYPES: PostAttachmentType[] = [
  PostAttachmentType.LECTURE,
  PostAttachmentType.VIDEO,
  PostAttachmentType.FILE,
];

export interface PaginatedPosts {
  data: PostDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface PostStats {
  totalPosts: number;
  totalComments: number;
  totalReplies: number;
  totalReactions: number;
  dailyPosts: DailyCount[];
}

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    private readonly gamificationService: GamificationService,
    private readonly notificationsService: NotificationsService,
    private readonly lectureIndexService: LectureIndexService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly usersService: UsersService,
  ) {}

  // Shared by posts/comments: pulls @mention tokens out of raw text and keeps only ids that both
  // resolve to a real user and aren't the author themselves (self-mentions are dropped silently
  // rather than notified, mirroring the existing "!== authorId" checks around this file).
  private async resolveMentions(text: string, authorId: string): Promise<Types.ObjectId[]> {
    const candidateIds = extractMentionIds(text).filter((id) => id !== authorId);
    if (!candidateIds.length) return [];
    const validIds = await this.usersService.findExistingIds(candidateIds);
    return validIds.map((id) => new Types.ObjectId(id));
  }

  async create(
    authorId: string,
    authorRole: Role,
    authorDepartment: Department | null,
    dto: CreatePostDto,
  ): Promise<PostDocument> {
    if (dto.attachmentType && MATERIAL_ATTACHMENT_TYPES.includes(dto.attachmentType) && authorRole === Role.STUDENT) {
      throw new ForbiddenException('رفع المقررات الدراسية متاح للمشرفين وأعضاء هيئة التدريس فقط');
    }

    if (dto.department && dto.academicYear && !getAcademicYearsForDepartment(dto.department).includes(dto.academicYear)) {
      throw new BadRequestException('السنة الدراسية المختارة غير متاحة لهذه الشعبة.');
    }

    // Public unless the author has a department and either didn't specify a scope (defaults to
    // their department) or explicitly asked for one -- a departmentless author can never post to
    // 'department' scope since there's nothing to scope it to.
    const scope = authorDepartment ? (dto.scope ?? PostScope.DEPARTMENT) : PostScope.PUBLIC;

    // A lecture/video library upload (components/lectures/UploadLectureModal) explicitly tags its
    // own department/year/specialization, independent of scope -- those uploads are always
    // 'public' but still need the tags for browse filtering. A regular feed post has none of
    // dto.department/academicYear/specialization, so it snapshots the author's own profile values
    // instead -- same idea as the department snapshot below, just sourced from the User doc since
    // the JWT payload only carries department.
    const author = dto.academicYear === undefined || dto.specialization === undefined ? await this.usersService.findById(authorId) : null;

    const caption = dto.caption ?? '';
    const mentions = await this.resolveMentions(caption, authorId);

    const post = new this.postModel({
      author: new Types.ObjectId(authorId),
      caption,
      attachmentType: dto.attachmentType ?? 'none',
      attachmentUrl: dto.attachmentUrl ?? null,
      attachmentOriginalName: dto.attachmentOriginalName ?? null,
      attachmentSize: dto.attachmentSize ?? null,
      images: dto.images ?? [],
      courseCode: dto.courseCode ?? null,
      scope,
      department: dto.department ?? authorDepartment ?? null,
      academicYear: dto.academicYear ?? author?.academicYear ?? null,
      specialization: dto.specialization ?? author?.specialization ?? null,
      hashtags: parseHashtags(caption),
      mentions,
    });
    await post.save();

    for (const recipient of mentions) {
      await this.notificationsService.create({
        recipient,
        actor: authorId,
        type: 'mention',
        postId: post.id,
        preview: caption.slice(0, 120),
      });
    }

    // Fire-and-forget: a failed extraction just means this lecture isn't searchable by the AI
    // assistant yet, never a user-facing error blocking the post from being created.
    void this.lectureIndexService.indexIfLecture({
      sourceType: 'post',
      sourceId: post.id,
      attachmentType: post.attachmentType,
      attachmentUrl: post.attachmentUrl,
      attachmentOriginalName: post.attachmentOriginalName,
      courseCode: post.courseCode,
      department: post.department,
    });

    await this.gamificationService.awardPoints(authorId, POINTS.POST_CREATED);
    const postCount = await this.postModel.countDocuments({ author: post.author }).exec();
    if (postCount === 1) await this.gamificationService.maybeAwardBadge(authorId, 'first_post');

    this.realtimeEmitter.emitToAdmins('admin:activity', {
      type: 'post',
      summary: post.caption ? `منشور جديد: ${post.caption.slice(0, 60)}` : 'منشور جديد',
      at: new Date(),
    });

    return post.populate('author', 'name role photoUrl collegeId');
  }

  // Simple reverse-chronological feed with optional course/author/attachment filter and pagination.
  // `scope`/`viewerDepartment` split the feed into "public" (everyone) vs "department" (only the
  // viewer's own department, taken from their JWT -- never client-suppliable, so a student can
  // never query another department's feed).
  async feed(
    page = 1,
    limit = 20,
    courseCode?: string,
    authorId?: string,
    hasAttachment?: boolean,
    scope?: PostScope,
    viewerDepartment?: Department | null,
    filters?: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization },
  ): Promise<PostDocument[]> {
    const filter: Record<string, unknown> = {};
    if (courseCode) filter.courseCode = courseCode;
    if (authorId) filter.author = new Types.ObjectId(authorId);
    if (hasAttachment) filter.attachmentType = { $ne: 'none' };
    if (scope === PostScope.DEPARTMENT) {
      // Locked to the viewer's own department (from the JWT, never client-suppliable) -- an
      // explicit `filters.department` is ignored here rather than allowed to override it, so this
      // stays a pure narrowing filter and never a way to peek into another department's feed.
      filter.scope = PostScope.DEPARTMENT;
      filter.department = viewerDepartment ?? null;
    } else {
      if (scope === PostScope.PUBLIC) filter.scope = PostScope.PUBLIC;
      if (filters?.department) filter.department = filters.department;
    }
    if (filters?.academicYear) filter.academicYear = filters.academicYear;
    if (filters?.specialization) filter.specialization = filters.specialization;
    return this.postModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  // The PDF/video lecture library (components/lectures/): always scope='public' by design (see
  // Post.department's comment) -- department/academicYear/specialization/courseCode are pure
  // filter tags here, not access control, so unlike feed()/search() there's no viewer-department
  // restriction: anyone can browse anyone's uploaded lecture regardless of their own department.
  async browseAttachments(
    attachmentType: 'lecture' | 'video',
    filters: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization; courseCode?: string; q?: string },
    page = 1,
    limit = 20,
  ): Promise<PostDocument[]> {
    const filter: Record<string, unknown> = { attachmentType, scope: PostScope.PUBLIC };
    if (filters.department) filter.department = filters.department;
    if (filters.academicYear) filter.academicYear = filters.academicYear;
    if (filters.specialization) filter.specialization = filters.specialization;
    if (filters.courseCode) filter.courseCode = filters.courseCode;
    if (filters.q) filter.$text = { $search: filters.q };

    return this.postModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .exec();
  }

  // Used by SearchService -- $text search over caption, scoped the same way the feed is (a
  // department-scoped post never surfaces to a viewer outside that department).
  async search(query: string, limit: number, viewerDepartment?: Department | null): Promise<PostDocument[]> {
    return this.postModel
      .find({
        $text: { $search: query },
        $or: [{ scope: PostScope.PUBLIC }, { scope: PostScope.DEPARTMENT, department: viewerDepartment ?? null }],
      })
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  // Used by SearchService for a `#tag` query -- same visibility scoping as search() above, just
  // matching against the derived `hashtags` array instead of a $text search on caption.
  async searchByHashtag(tag: string, limit: number, viewerDepartment?: Department | null): Promise<PostDocument[]> {
    return this.postModel
      .find({
        hashtags: tag.toLowerCase(),
        $or: [{ scope: PostScope.PUBLIC }, { scope: PostScope.DEPARTMENT, department: viewerDepartment ?? null }],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  async findOne(id: string): Promise<PostDocument> {
    const post = await this.postModel
      .findById(id)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
    if (!post) throw new NotFoundException('المنشور غير موجود');
    return post;
  }

  // One reaction per user per post: picking the same type again removes it, a different type
  // replaces it.
  async setReaction(id: string, userId: string, type: ReactionType): Promise<PostDocument> {
    const post = await this.findOne(id);
    const uid = new Types.ObjectId(userId);
    const idx = post.reactions.findIndex((r) => r.user.equals(uid));
    const isNewReaction = idx < 0;

    if (idx >= 0 && post.reactions[idx].type === type) {
      post.reactions.splice(idx, 1);
    } else if (idx >= 0) {
      post.reactions[idx].type = type;
    } else {
      post.reactions.push({ user: uid, type });
    }
    await post.save();

    if (isNewReaction) {
      await this.gamificationService.awardPoints(userId, POINTS.REACTION_GIVEN);
      if (post.reactions.length >= 10 && post.author) {
        await this.gamificationService.maybeAwardBadge(post.author._id.toString(), 'helpful_10');
      }
      if (post.author && post.author._id.toString() !== userId) {
        await this.notificationsService.create({
          recipient: post.author._id,
          actor: userId,
          type: 'post_reaction',
          postId: id,
          preview: type,
        });
      }
    }
    return post;
  }

  async update(id: string, requesterId: string, caption: string): Promise<PostDocument> {
    const post = await this.findOne(id);
    if (!post.author || post.author._id.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك تعديل منشوراتك فقط');
    }
    const previousMentions = new Set(post.mentions.map((m) => m.toString()));
    const mentions = await this.resolveMentions(caption, requesterId);

    post.caption = caption;
    post.edited = true;
    post.hashtags = parseHashtags(caption);
    post.mentions = mentions;
    await post.save();

    // Only newly-added mentions get pinged -- otherwise every unrelated edit would re-notify
    // everyone already tagged in the post.
    for (const recipient of mentions) {
      if (previousMentions.has(recipient.toString())) continue;
      await this.notificationsService.create({
        recipient,
        actor: requesterId,
        type: 'mention',
        postId: post.id,
        preview: caption.slice(0, 120),
      });
    }
    return post;
  }

  // Populated reactor list for the "seen by" modal -- fetched lazily on demand rather than
  // embedded in every feed response, since most posts' reactions are never inspected.
  async listReactions(id: string): Promise<{ user: unknown; type: ReactionType }[]> {
    const post = await this.postModel.findById(id).populate('reactions.user', 'name role photoUrl').exec();
    if (!post) throw new NotFoundException('المنشور غير موجود');
    return post.reactions;
  }

  // Shares always point at the ORIGINAL post, even when sharing a share, so the embedded preview
  // never has to walk a chain and share attribution stays flat (mirrors Facebook's own behavior).
  async share(id: string, userId: string, authorDepartment: Department | null, dto: SharePostDto): Promise<PostDocument> {
    const source = await this.postModel.findById(id).exec();
    if (!source) throw new NotFoundException('المنشور غير موجود');
    const rootId = source.sharedFrom ?? source._id;

    const root = await this.postModel.findById(rootId).exec();
    if (!root) throw new NotFoundException('المنشور الأصلي غير موجود');

    const scope = authorDepartment ? PostScope.DEPARTMENT : PostScope.PUBLIC;
    // Same profile snapshot as a regular post (see create()) -- so a share is filterable by the
    // sharer's own department/year/specialization just like anything else in the feed.
    const author = await this.usersService.findById(userId);
    const share = new this.postModel({
      author: new Types.ObjectId(userId),
      caption: dto.caption ?? '',
      attachmentType: 'none',
      scope,
      department: authorDepartment ?? null,
      academicYear: author.academicYear ?? null,
      specialization: author.specialization ?? null,
      sharedFrom: rootId,
    });
    await share.save();

    root.shareCount += 1;
    await root.save();

    if (root.author && root.author.toString() !== userId) {
      await this.notificationsService.create({
        recipient: root.author,
        actor: userId,
        type: 'post_share',
        postId: share.id,
        preview: dto.caption?.slice(0, 120) ?? '',
      });
    }

    return this.findOne(share.id);
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const post = await this.findOne(id);
    if (!post.author || post.author._id.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك حذف منشوراتك فقط');
    }
    await this.postModel.findByIdAndDelete(id).exec();
    await this.commentModel.deleteMany({ post: post._id }).exec();
  }

  async addComment(postId: string, authorId: string, text: string): Promise<CommentDocument> {
    const post = await this.findOne(postId);
    const mentions = await this.resolveMentions(text, authorId);
    const comment = await new this.commentModel({
      post: post._id,
      author: new Types.ObjectId(authorId),
      text,
      mentions,
    }).save();
    await this.postModel.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } }).exec();
    await this.gamificationService.awardPoints(authorId, POINTS.COMMENT_ADDED);
    if (post.author && post.author._id.toString() !== authorId) {
      await this.notificationsService.create({
        recipient: post.author._id,
        actor: authorId,
        type: 'post_comment',
        postId,
        preview: text.slice(0, 120),
      });
    }
    // The post author already got a post_comment notification above -- skip re-pinging them here
    // as a mention too.
    for (const recipient of mentions) {
      if (post.author && recipient.equals(post.author._id)) continue;
      await this.notificationsService.create({
        recipient,
        actor: authorId,
        type: 'mention',
        postId,
        preview: text.slice(0, 120),
      });
    }
    return comment.populate('author', 'name role photoUrl');
  }

  // Top-level comments only -- replies are fetched per-parent via listReplies().
  async listComments(postId: string, page = 1, limit = 20): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ post: new Types.ObjectId(postId), parentComment: null })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl')
      .exec();
  }

  async addReply(parentCommentId: string, authorId: string, text: string): Promise<CommentDocument> {
    const parent = await this.commentModel.findById(parentCommentId).exec();
    if (!parent) throw new NotFoundException('التعليق غير موجود');

    const mentions = await this.resolveMentions(text, authorId);
    const reply = await new this.commentModel({
      post: parent.post,
      parentComment: parent._id,
      author: new Types.ObjectId(authorId),
      text,
      mentions,
    }).save();
    await this.commentModel.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } }).exec();
    await this.gamificationService.awardPoints(authorId, POINTS.REPLY_ADDED);
    if (parent.author.toString() !== authorId) {
      await this.notificationsService.create({
        recipient: parent.author,
        actor: authorId,
        type: 'comment_reply',
        postId: parent.post.toString(),
        preview: text.slice(0, 120),
      });
    }
    // Same dedup as addComment() -- don't double-notify the parent-comment author as a mention too.
    for (const recipient of mentions) {
      if (recipient.equals(parent.author)) continue;
      await this.notificationsService.create({
        recipient,
        actor: authorId,
        type: 'mention',
        postId: parent.post.toString(),
        preview: text.slice(0, 120),
      });
    }
    return reply.populate('author', 'name role photoUrl');
  }

  async listReplies(parentCommentId: string, page = 1, limit = 20): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ parentComment: new Types.ObjectId(parentCommentId) })
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl')
      .exec();
  }

  // Same one-reaction-per-user toggle as setReaction() on posts.
  async setCommentReaction(commentId: string, userId: string, type: ReactionType): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    const uid = new Types.ObjectId(userId);
    const idx = comment.reactions.findIndex((r) => r.user.equals(uid));
    const isNewReaction = idx < 0;

    if (idx >= 0 && comment.reactions[idx].type === type) {
      comment.reactions.splice(idx, 1);
    } else if (idx >= 0) {
      comment.reactions[idx].type = type;
    } else {
      comment.reactions.push({ user: uid, type });
    }
    await comment.save();

    if (isNewReaction) {
      await this.gamificationService.awardPoints(userId, POINTS.REACTION_GIVEN);
      if (comment.author.toString() !== userId) {
        await this.notificationsService.create({
          recipient: comment.author,
          actor: userId,
          type: 'comment_reaction',
          postId: comment.post.toString(),
          preview: type,
        });
      }
    }
    return comment.populate('author', 'name role photoUrl');
  }

  async updateComment(commentId: string, requesterId: string, text: string): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    if (comment.author.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك تعديل تعليقاتك فقط');
    }
    const previousMentions = new Set(comment.mentions.map((m) => m.toString()));
    const mentions = await this.resolveMentions(text, requesterId);

    comment.text = text;
    comment.edited = true;
    comment.mentions = mentions;
    await comment.save();

    // Same new-mentions-only rule as Post.update() -- editing shouldn't re-notify people already tagged.
    for (const recipient of mentions) {
      if (previousMentions.has(recipient.toString())) continue;
      await this.notificationsService.create({
        recipient,
        actor: requesterId,
        type: 'mention',
        postId: comment.post.toString(),
        preview: text.slice(0, 120),
      });
    }
    return comment.populate('author', 'name role photoUrl');
  }

  // Same lazy "seen by" pattern as listReactions() on posts.
  async listCommentReactions(commentId: string): Promise<{ user: unknown; type: ReactionType }[]> {
    const comment = await this.commentModel.findById(commentId).populate('reactions.user', 'name role photoUrl').exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    return comment.reactions;
  }

  async removeComment(commentId: string, requesterId: string): Promise<void> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('التعليق غير موجود');
    if (comment.author.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك حذف تعليقاتك فقط');
    }
    await this.deleteCommentAndReplies(comment._id);
    if (comment.parentComment) {
      await this.commentModel.findByIdAndUpdate(comment.parentComment, { $inc: { replyCount: -1 } }).exec();
    } else {
      await this.postModel.findByIdAndUpdate(comment.post, { $inc: { commentCount: -1 } }).exec();
    }
  }

  // Recursively removes a comment's entire reply subtree before removing the comment itself.
  private async deleteCommentAndReplies(commentId: Types.ObjectId): Promise<void> {
    const children = await this.commentModel.find({ parentComment: commentId }, '_id').exec();
    for (const child of children) {
      await this.deleteCommentAndReplies(child._id);
    }
    await this.commentModel.findByIdAndDelete(commentId).exec();
  }

  async toggleSave(id: string, userId: string): Promise<PostDocument> {
    const post = await this.findOne(id);
    const uid = new Types.ObjectId(userId);
    const alreadySaved = post.savedBy.some((savedId) => savedId.equals(uid));

    if (alreadySaved) {
      post.savedBy = post.savedBy.filter((savedId) => !savedId.equals(uid));
    } else {
      post.savedBy.push(uid);
    }
    return post.save();
  }

  async findSaved(userId: string, page = 1, limit = 20): Promise<PostDocument[]> {
    return this.postModel
      .find({ savedBy: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  // Distinct course codes that have at least one attachment, most recently active first.
  async coursesWithAttachments(): Promise<{ courseCode: string; attachmentCount: number; latestAt: Date }[]> {
    return this.postModel.aggregate([
      { $match: { attachmentType: { $ne: 'none' }, courseCode: { $ne: null } } },
      { $group: { _id: '$courseCode', attachmentCount: { $sum: 1 }, latestAt: { $max: '$createdAt' } } },
      { $project: { _id: 0, courseCode: '$_id', attachmentCount: 1, latestAt: 1 } },
      { $sort: { latestAt: -1 } },
    ]);
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async adminListPosts(page = 1, limit = 20, search?: string): Promise<PaginatedPosts> {
    const filter = search
      ? { $or: [{ caption: { $regex: search, $options: 'i' } }, { courseCode: { $regex: search, $options: 'i' } }] }
      : {};

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name role photoUrl collegeId')
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  // Same as remove() but skips the author-ownership check -- an admin can delete any post.
  async adminRemovePost(id: string): Promise<void> {
    const post = await this.postModel.findById(id).exec();
    if (!post) throw new NotFoundException('المنشور غير موجود');
    await this.postModel.findByIdAndDelete(id).exec();
    await this.commentModel.deleteMany({ post: post._id }).exec();
  }

  async getStats(): Promise<PostStats> {
    const [totalPosts, totalComments, totalReplies, postReactions, commentReactions, dailyPosts] = await Promise.all([
      this.postModel.countDocuments().exec(),
      this.commentModel.countDocuments({ parentComment: null }).exec(),
      this.commentModel.countDocuments({ parentComment: { $ne: null } }).exec(),
      this.sumReactions(this.postModel),
      this.sumReactions(this.commentModel),
      this.dailyPosts(14),
    ]);
    return { totalPosts, totalComments, totalReplies, totalReactions: postReactions + commentReactions, dailyPosts };
  }

  private async sumReactions(model: Model<PostDocument> | Model<CommentDocument>): Promise<number> {
    const rows = await model
      .aggregate<{ total: number }>([
        { $project: { count: { $size: '$reactions' } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ])
      .exec();
    return rows[0]?.total ?? 0;
  }

  private async dailyPosts(days: number): Promise<DailyCount[]> {
    const rows = await this.postModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: daysAgoStart(days) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ])
      .exec();
    return fillDailyCounts(rows, days);
  }
}
