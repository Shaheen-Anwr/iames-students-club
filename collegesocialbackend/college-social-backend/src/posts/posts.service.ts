import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Response } from 'express';
import { Post, PostAttachmentType, PostDocument, PostScope, ReactionType } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { LectureFolder, LectureFolderDocument } from './schemas/lecture-folder.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { SharePostDto } from './dto/share-post.dto';
import { GamificationService } from '../gamification/gamification.service';
import { POINTS } from '../gamification/badges';
import { NotificationsService } from '../notifications/notifications.service';
import { Department } from '../common/enums/department.enum';
import { AcademicYear, getAcademicYearsForDepartment } from '../common/enums/academic-year.enum';
import { Specialization } from '../common/enums/specialization.enum';
import { LectureIndexService } from '../ai/lecture-index.service';
import {
  ATLAS_SEARCH_ENABLED,
  ATLAS_INDEX,
  atlasTextStage,
  warnAtlasFallbackOnce,
} from '../common/search/atlas-search.util';
import {
  type Cursor,
  decodeCursor,
  keysetMatch,
  KEYSET_SORT,
  nextCursorFrom,
} from '../common/pagination/cursor.util';
import {
  DailyCount,
  daysAgoStart,
  fillDailyCounts,
  previousWindowMatch,
  TrendSeries,
} from '../common/utils/daily-counts.util';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UsersService } from '../users/users.service';
import { extractMentionIds, parseHashtags } from '../common/utils/tag-parser.util';
import { Role } from '../common/enums/role.enum';
import { StorageService } from '../upload/storage.service';

// Uploading course material (a lecture or video attachment) is admin/professor only; a plain
// caption/image/generic-file post stays open to everyone. FILE is deliberately excluded here --
// it's the generic document-attach button in the everyday composer (open to all users), not a
// course-material upload; only LECTURE/VIDEO carry that connotation.
const MATERIAL_ATTACHMENT_TYPES: PostAttachmentType[] = [PostAttachmentType.LECTURE, PostAttachmentType.VIDEO];

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
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(LectureFolder.name) private lectureFolderModel: Model<LectureFolderDocument>,
    private readonly gamificationService: GamificationService,
    private readonly notificationsService: NotificationsService,
    private readonly lectureIndexService: LectureIndexService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
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
    const isMaterialUpload =
      !!dto.attachmentType && MATERIAL_ATTACHMENT_TYPES.includes(dto.attachmentType);

    if (isMaterialUpload && authorRole === Role.STUDENT) {
      throw new ForbiddenException('رفع المقررات الدراسية متاح للمشرفين وأعضاء هيئة التدريس فقط');
    }

    // A lecture/video (course-material) upload by a professor is always filed under THEIR OWN شعبة
    // -- never "كل الشعب" (null) or another شعبة, regardless of what the client sends. The browse
    // libraries (محاضرات PDF/فيديو + the "اكاديميا"/course-hub lecture lists) wall material by
    // شعبة, and cross-شعبة material must never enter that pool. Admins are exempt: they legitimately
    // publish genuinely college-wide material, so their explicit choice (any شعبة, or null = كل
    // الشعب) is honored as-is. Non-material posts are unaffected -- they snapshot as before.
    const resolvedDepartment =
      isMaterialUpload && authorRole !== Role.ADMIN
        ? authorDepartment ?? null
        : dto.department ?? authorDepartment ?? null;

    if (
      dto.academicYear &&
      resolvedDepartment &&
      !getAcademicYearsForDepartment(resolvedDepartment).includes(dto.academicYear)
    ) {
      throw new BadRequestException('السنة الدراسية المختارة غير متاحة لهذه الشعبة.');
    }

    // Audience selector. An explicit 'public'/'friends'/'private' is always honored as-is. When the
    // author doesn't pick anything, it defaults to their department page (if they have a department)
    // or the public feed. A departmentless author can never post to 'department' -- there's nothing
    // to scope it to, so that's coerced to 'public'.
    let scope = dto.scope ?? (authorDepartment ? PostScope.DEPARTMENT : PostScope.PUBLIC);
    if (scope === PostScope.DEPARTMENT && !authorDepartment) scope = PostScope.PUBLIC;

    // A lecture/video library upload (components/lectures/UploadLectureModal) explicitly tags its
    // own department/year/specialization, independent of scope -- those uploads are always
    // 'public' but still need the tags for browse filtering. A regular feed post has none of
    // dto.department/academicYear/specialization, so it snapshots the author's own profile values
    // instead -- same idea as the department snapshot below, just sourced from the User doc since
    // the JWT payload only carries department.
    const caption = dto.caption ?? '';
    // Independent lookups -- one reads the author's own profile (only when needed to snapshot
    // academicYear/specialization), the other reads mentioned users -- run together instead of one
    // after another.
    const [author, mentions] = await Promise.all([
      dto.academicYear === undefined || dto.specialization === undefined ? this.usersService.findById(authorId) : Promise.resolve(null),
      this.resolveMentions(caption, authorId),
    ]);

    const post = new this.postModel({
      author: new Types.ObjectId(authorId),
      caption,
      attachmentType: dto.attachmentType ?? 'none',
      attachmentUrl: dto.attachmentUrl ?? null,
      attachmentOriginalName: dto.attachmentOriginalName ?? null,
      attachmentSize: dto.attachmentSize ?? null,
      attachmentChunkCount: dto.attachmentChunkCount ?? null,
      images: dto.images ?? [],
      courseCode: dto.courseCode ?? null,
      scope,
      department: resolvedDepartment,
      academicYear: dto.academicYear ?? author?.academicYear ?? null,
      specialization: dto.specialization ?? author?.specialization ?? null,
      hashtags: parseHashtags(caption),
      mentions,
    });
    await post.save();

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

    // Independent post-save side effects -- mention notifications, gamification points, and the
    // "first post" badge check -- none of these need each other's result (the badge check chains
    // off its own count fetch), so they run together instead of one after another. Same
    // error-propagation contract as before (any failure here still fails the request) -- purely a
    // latency fix, not a behavior change.
    const notifyMentions = async (): Promise<void> => {
      // Don't ping someone about a mention in a post they wouldn't be allowed to open: never for a
      // 'private' post, and for a 'friends' post only if they're actually in the author's friends list.
      let notifiable = mentions;
      if (scope === PostScope.PRIVATE) {
        notifiable = [];
      } else if (scope === PostScope.FRIENDS) {
        const friendIds = new Set(await this.usersService.getFriendIds(authorId));
        notifiable = mentions.filter((m) => friendIds.has(m.toString()));
      }
      await Promise.all(
        notifiable.map((recipient) =>
          this.notificationsService.create({
            recipient,
            actor: authorId,
            type: 'mention',
            postId: post.id,
            preview: caption.slice(0, 120),
          }),
        ),
      );
    };

    const awardFirstPostBadgeIfNeeded = async (): Promise<void> => {
      const postCount = await this.postModel.countDocuments({ author: post.author }).exec();
      if (postCount === 1) await this.gamificationService.maybeAwardBadge(authorId, 'first_post');
    };

    await Promise.all([
      notifyMentions(),
      this.gamificationService.awardPoints(authorId, POINTS.POST_CREATED, 'post_created', { postId: post.id, courseCode: post.courseCode ?? null }),
      awardFirstPostBadgeIfNeeded(),
    ]);

    this.realtimeEmitter.emitToAdmins('admin:activity', {
      type: 'post',
      summary: post.caption ? `منشور جديد: ${post.caption.slice(0, 60)}` : 'منشور جديد',
      at: new Date(),
    });

    return post.populate('author', 'name role photoUrl collegeId');
  }

  // Reverse-chronological feed with optional course/author/attachment filter and pagination.
  // `scope`/`viewerDepartment` split the feed into "public" (everyone) vs "department" (only the
  // viewer's own department, taken from their JWT -- never client-suppliable, so a student can
  // never query another department's feed).
  //
  // On the main "عام" feed and the شعبة feed, the viewer's own academic year is prioritised: posts
  // tagged with their academicYear (plus untagged / college-wide posts) come first, then every
  // other year's, each tier newest-first -- see the tiering block below.
  // Builds the Mongo filter for feed()/feedCursor() -- the scope/visibility branching is identical
  // for both, only the pagination differs.
  private async buildFeedFilter(
    courseCode?: string,
    authorId?: string,
    hasAttachment?: boolean,
    scope?: PostScope,
    viewerDepartment?: Department | null,
    filters?: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization },
    viewerId?: string,
    // Main-feed branch only: when the caller already resolved this (see feed()/feedCursor(), which
    // need it anyway for the academic-year tier), reuse it instead of this method fetching the
    // viewer's friend list itself -- one fewer DB round trip on the hottest endpoint in the app.
    preloadedFriendIds?: string[],
  ): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};
    if (courseCode) filter.courseCode = courseCode;
    if (hasAttachment) filter.attachmentType = { $ne: 'none' };

    if (scope === PostScope.DEPARTMENT) {
      // Locked to the viewer's own department (from the JWT, never client-suppliable) -- an
      // explicit `filters.department` is ignored here rather than allowed to override it, so this
      // stays a pure narrowing filter and never a way to peek into another department's feed.
      filter.scope = PostScope.DEPARTMENT;
      filter.department = viewerDepartment ?? null;
      if (authorId) filter.author = new Types.ObjectId(authorId);
    } else if (authorId) {
      // Profile feed -- one author's posts, narrowed to the audiences this viewer is allowed to
      // see. The author sees all of their own; anyone else sees 'public'/'department', plus
      // 'friends' only if they're actually in the author's friends list. 'private' never leaks.
      filter.author = new Types.ObjectId(authorId);
      if (!viewerId || viewerId !== authorId) {
        const friendIds = viewerId ? await this.usersService.getFriendIds(viewerId) : [];
        const visibleScopes: PostScope[] = [PostScope.PUBLIC, PostScope.DEPARTMENT];
        if (friendIds.includes(authorId)) visibleScopes.push(PostScope.FRIENDS);
        filter.scope = { $in: visibleScopes };
      }
      if (filters?.department) filter.department = filters.department;
    } else {
      // Main "عام" feed -- public posts, plus the two audience-restricted kinds the viewer is
      // entitled to: 'friends' posts authored by someone they're friends with, and their own
      // 'friends'/'private' posts. 'department' stays out of this tab (it has its own).
      //
      // A viewer WITH a شعبة (department) only sees public posts from their own شعبة here -- across
      // every academic year/specialization -- plus college-wide posts that carry no department tag
      // at all (admin announcements, posts by staff with no department). Another شعبة's public
      // posts never surface. A viewer with no department (staff/admin) is unrestricted; there's no
      // شعبة to scope them to.
      const publicPosts: Record<string, unknown> = { scope: PostScope.PUBLIC };
      if (viewerDepartment) publicPosts.department = { $in: [viewerDepartment, null] };
      const or: Record<string, unknown>[] = [publicPosts];
      if (viewerId) {
        const friendIds = preloadedFriendIds ?? (await this.usersService.getFriendIds(viewerId));
        const friendObjectIds = friendIds.map((id) => new Types.ObjectId(id));
        or.push({ scope: PostScope.FRIENDS, author: { $in: friendObjectIds } });
        or.push({
          author: new Types.ObjectId(viewerId),
          scope: { $in: [PostScope.FRIENDS, PostScope.PRIVATE] },
        });
      }
      filter.$or = or;
      if (filters?.department) filter.department = filters.department;
    }
    if (filters?.academicYear) filter.academicYear = filters.academicYear;
    if (filters?.specialization) filter.specialization = filters.specialization;
    return filter;
  }

  // True when the own-academic-year priority tier applies (see the tiering comment on feed()
  // below) -- pure condition check, no lookup. Whenever this is true, feed()/feedCursor() also
  // need the viewer's academicYear (for the tier boundary) and, via buildFeedFilter's main-feed
  // branch, their friend list -- both come from ONE combined query
  // (usersService.getFriendIdsAndAcademicYear) rather than each being fetched separately.
  private tieringApplies(
    authorId: string | undefined,
    courseCode: string | undefined,
    explicitYear: AcademicYear | undefined,
    viewerId: string | undefined,
  ): viewerId is string {
    return !authorId && !courseCode && !explicitYear && !!viewerId;
  }

  async feed(
    page = 1,
    limit = 20,
    courseCode?: string,
    authorId?: string,
    hasAttachment?: boolean,
    scope?: PostScope,
    viewerDepartment?: Department | null,
    filters?: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization },
    viewerId?: string,
  ): Promise<PostDocument[]> {
    const viewerCtx = this.tieringApplies(authorId, courseCode, filters?.academicYear, viewerId)
      ? await this.usersService.getFriendIdsAndAcademicYear(viewerId)
      : null;

    const filter = await this.buildFeedFilter(
      courseCode,
      authorId,
      hasAttachment,
      scope,
      viewerDepartment,
      filters,
      viewerId,
      viewerCtx?.friendIds,
    );

    const skip = (page - 1) * limit;

    // Priority for the student's own academic year: on the main "عام" feed and the شعبة feed, show
    // posts tagged with the viewer's academicYear -- plus untagged / college-wide posts -- ahead of
    // every other year's, each tier still newest-first. Skipped for the profile feed, a
    // course-filtered view, an explicit academicYear filter the viewer chose, or a viewer with no
    // academicYear of their own to prioritise.
    if (viewerCtx) {
      const viewerYear = viewerCtx.academicYear;
      if (viewerYear) {
        const ownYear = { ...filter, academicYear: { $in: [viewerYear, null] } };
        const otherYears = { ...filter, academicYear: { $nin: [viewerYear, null] } };

        // First page: fetch the own-year tier straight off and top up from other years only if it
        // doesn't fill the page -- no countDocuments on the hot path.
        if (skip === 0) {
          const head = await this.findFeedPage(ownYear, 0, limit);
          if (head.length === limit) return head;
          const tail = await this.findFeedPage(otherYears, 0, limit - head.length);
          return [...head, ...tail];
        }

        // Deeper pages need the tier boundary to translate the offset.
        const ownYearTotal = await this.postModel.countDocuments(ownYear);
        if (skip + limit <= ownYearTotal) return this.findFeedPage(ownYear, skip, limit);
        if (skip >= ownYearTotal) return this.findFeedPage(otherYears, skip - ownYearTotal, limit);
        const head = await this.findFeedPage(ownYear, skip, ownYearTotal - skip);
        const tail = await this.findFeedPage(otherYears, 0, limit - head.length);
        return [...head, ...tail];
      }
    }

    return this.findFeedPage(filter, skip, limit);
  }

  // The reverse-chronological page fetch shared by feed()'s tiers -- same sort, populate and
  // pagination as the plain feed, split out so the academic-year tiering can call it per tier.
  private findFeedPage(filter: Record<string, unknown>, skip: number, limit: number): Promise<PostDocument[]> {
    return this.postModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  // Same as findFeedPage but keyset instead of skip: "strictly older than `cur`", `{createdAt,_id}`
  // descending. The compound indexes end in `createdAt: -1`, so this is an index range scan at any
  // depth -- no walking past N skipped docs.
  private findFeedPageKeyset(
    filter: Record<string, unknown>,
    cur: Cursor | null,
    limit: number,
  ): Promise<PostDocument[]> {
    const q = cur ? { ...filter, ...keysetMatch(cur) } : filter;
    return this.postModel
      .find(q)
      .sort(KEYSET_SORT)
      .limit(limit)
      .populate('author', 'name role photoUrl collegeId')
      .populate({ path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } })
      .exec();
  }

  // Cursor-paginated feed. Same filter + same two-tier academic-year ordering as feed(), but the
  // page boundary is an opaque keyset cursor (see cursor.util) instead of page/skip. The tier tag
  // rides in the cursor: 'a' = still inside the viewer's own-year tier, 'b' = past it into other
  // years. Returns { items, nextCursor } -- nextCursor is null on the last page.
  async feedCursor(
    before: string | undefined,
    limit = 20,
    courseCode?: string,
    authorId?: string,
    hasAttachment?: boolean,
    scope?: PostScope,
    viewerDepartment?: Department | null,
    filters?: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization },
    viewerId?: string,
  ): Promise<{ items: PostDocument[]; nextCursor: string | null }> {
    const viewerCtx = this.tieringApplies(authorId, courseCode, filters?.academicYear, viewerId)
      ? await this.usersService.getFriendIdsAndAcademicYear(viewerId)
      : null;

    const filter = await this.buildFeedFilter(
      courseCode,
      authorId,
      hasAttachment,
      scope,
      viewerDepartment,
      filters,
      viewerId,
      viewerCtx?.friendIds,
    );
    const cur = decodeCursor(before);
    const viewerYear = viewerCtx?.academicYear ?? null;

    // Non-tiered: one keyset query.
    if (!viewerYear) {
      const items = await this.findFeedPageKeyset(filter, cur, limit);
      return { items, nextCursor: nextCursorFrom(items, limit) };
    }

    const ownYear = { ...filter, academicYear: { $in: [viewerYear, null] } };
    const otherYears = { ...filter, academicYear: { $nin: [viewerYear, null] } };

    // Already past the own-year tier -- stay in 'other years'.
    if (cur?.t === 'b') {
      const items = await this.findFeedPageKeyset(otherYears, cur, limit);
      return { items, nextCursor: nextCursorFrom(items, limit, 'b') };
    }

    // In (or starting) the own-year tier. Fill from own-year; if it runs dry mid-page, top up
    // from the start of 'other years'.
    const head = await this.findFeedPageKeyset(ownYear, cur?.t === 'a' ? cur : null, limit);
    if (head.length === limit) {
      return { items: head, nextCursor: nextCursorFrom(head, limit, 'a') };
    }
    const tail = await this.findFeedPageKeyset(otherYears, null, limit - head.length);
    const items = [...head, ...tail];
    // If the tail contributed rows, the next page continues 'other years'; otherwise everything
    // is exhausted (head < limit and tail empty) -> last page.
    return { items, nextCursor: tail.length > 0 ? nextCursorFrom(items, limit, 'b') : null };
  }

  // "Since you were away": how many new lecture/video/file uploads landed in the given courses
  // after `since`, scoped to what this viewer can see (same public + own-شعبة rule as the feed).
  async countLecturesSince(courseCodes: string[], since: Date, viewerDepartment?: Department | null): Promise<number> {
    if (!courseCodes.length) return 0;
    const filter: Record<string, unknown> = {
      courseCode: { $in: courseCodes },
      attachmentType: { $ne: PostAttachmentType.NONE },
      scope: PostScope.PUBLIC,
      createdAt: { $gt: since },
    };
    if (viewerDepartment) filter.department = { $in: [viewerDepartment, null] };
    return this.postModel.countDocuments(filter).exec();
  }

  // The PDF/video lecture library (components/lectures/): always scope='public' by design (see
  // Post.department's comment). academicYear/specialization/courseCode are pure filter tags here,
  // but department is scoped the same way feed()/search() are: a viewer WITH a شعبة only browses
  // their own شعبة's material (plus untagged/college-wide uploads), never another شعبة's -- an
  // explicit filters.department is honored only while it matches. A viewer with no department
  // (staff/admin) keeps the old cross-شعبة browse and can filter by any department.
  async browseAttachments(
    attachmentType: 'lecture' | 'video',
    filters: { department?: Department; academicYear?: AcademicYear; specialization?: Specialization; courseCode?: string; q?: string },
    page = 1,
    limit = 20,
    viewerDepartment?: Department | null,
  ): Promise<PostDocument[]> {
    const filter: Record<string, unknown> = { attachmentType, scope: PostScope.PUBLIC };
    if (viewerDepartment) {
      filter.department = { $in: [viewerDepartment, null] };
    } else if (filters.department) {
      filter.department = filters.department;
    }
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

  // The scope filter shared by search()/searchByHashtag(), mirroring PostsService.feed()'s "عام"
  // branch: a viewer WITH a شعبة (department) matches a public post only when it carries their own
  // شعبة tag or none at all (college-wide), and a 'department' post only within their own شعبة; a
  // viewer with no department matches every public post. 'friends'/'private' never surface here.
  private visibilityOr(viewerDepartment?: Department | null): Record<string, unknown>[] {
    return [
      viewerDepartment
        ? { scope: PostScope.PUBLIC, department: { $in: [viewerDepartment, null] } }
        : { scope: PostScope.PUBLIC },
      { scope: PostScope.DEPARTMENT, department: viewerDepartment ?? null },
    ];
  }

  // Used by SearchService -- $text search over caption, scoped the same way the feed is (a post
  // from another شعبة never surfaces to a viewer whose own شعبة is set).
  async search(query: string, limit: number, viewerDepartment?: Department | null): Promise<PostDocument[]> {
    if (ATLAS_SEARCH_ENABLED && query.trim()) {
      try {
        const docs = await this.postModel
          .aggregate([
            atlasTextStage(ATLAS_INDEX.posts, query, ['caption']),
            { $match: { $or: this.visibilityOr(viewerDepartment) } },
            { $limit: limit },
          ])
          .exec();
        return (await this.postModel.populate(docs, [
          { path: 'author', select: 'name role photoUrl collegeId' },
          { path: 'sharedFrom', populate: { path: 'author', select: 'name role photoUrl collegeId' } },
        ])) as unknown as PostDocument[];
      } catch (err) {
        warnAtlasFallbackOnce(err);
      }
    }
    return this.postModel
      .find({
        $text: { $search: query },
        $or: this.visibilityOr(viewerDepartment),
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
        $or: this.visibilityOr(viewerDepartment),
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

  // Access rule for a single post reached directly (a permalink, an attachment stream, or any
  // interaction like reacting/commenting/sharing) rather than through feed()'s own filtering.
  // 'public'/'department' are visible to any signed-in user here -- department is a browse filter
  // in feed()/search(), not a hard wall on a direct link, matching the app's existing behavior.
  // 'friends' requires being in the author's friends list; 'private' is author-only.
  private async canViewScope(scope: PostScope, authorId: string | null, viewerId: string): Promise<boolean> {
    if (authorId && authorId === viewerId) return true;
    if (scope === PostScope.PRIVATE) return false;
    if (scope === PostScope.FRIENDS) {
      if (!authorId) return false;
      return (await this.usersService.getFriendIds(viewerId)).includes(authorId);
    }
    return true;
  }

  // findOne() + the audience check above -- 404s (rather than 403s) when the viewer isn't allowed
  // to see it, so a restricted post is indistinguishable from a non-existent one.
  async findOneForViewer(id: string, viewerId: string): Promise<PostDocument> {
    const post = await this.findOne(id);
    const authorId = post.author ? (post.author as { _id: Types.ObjectId })._id.toString() : null;
    if (!(await this.canViewScope(post.scope, authorId, viewerId))) {
      throw new NotFoundException('المنشور غير موجود');
    }
    return post;
  }

  // Streams a post's 'lecture'/'file' (raw) attachment to the response -- the actual Cloudinary
  // reassembly (for one that was too large for a single asset and got split, see
  // StorageService.upload()'s raw-splitting path) is shared with every other feature that can carry
  // one; see StorageService.streamRawAttachment().
  async streamAttachment(id: string, res: Response, viewerId: string): Promise<void> {
    const post = await this.postModel.findById(id).lean().exec();
    if (!post || !post.attachmentUrl) throw new NotFoundException('المرفق غير موجود');

    const authorId = post.author ? post.author.toString() : null;
    if (!(await this.canViewScope(post.scope, authorId, viewerId))) {
      throw new NotFoundException('المرفق غير موجود');
    }

    await this.storageService.streamRawAttachment(res, {
      url: post.attachmentUrl,
      chunkCount: post.attachmentChunkCount ?? 1,
      originalName: post.attachmentOriginalName,
    });
  }

  // One reaction per user per post: picking the same type again removes it, a different type
  // replaces it.
  async setReaction(id: string, userId: string, type: ReactionType): Promise<PostDocument> {
    const post = await this.findOneForViewer(id, userId);
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
      await this.gamificationService.awardPoints(userId, POINTS.REACTION_GIVEN, 'reaction_given');
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
    // everyone already tagged in the post. Same audience gate as create(): no mention pings on a
    // 'private' post, and on a 'friends' post only to people in the author's friends list.
    const friendIds =
      post.scope === PostScope.FRIENDS ? new Set(await this.usersService.getFriendIds(requesterId)) : null;
    for (const recipient of mentions) {
      if (previousMentions.has(recipient.toString())) continue;
      if (post.scope === PostScope.PRIVATE) continue;
      if (friendIds && !friendIds.has(recipient.toString())) continue;
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

    // Only 'public'/'department' posts can be reshared -- forwarding a friends-only or "only me"
    // post to the sharer's own (potentially wider) audience would leak it past the original
    // author's chosen circle.
    if (root.scope === PostScope.FRIENDS || root.scope === PostScope.PRIVATE) {
      throw new ForbiddenException('لا يمكن مشاركة منشور خاص');
    }

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
    // Independent lookups -- one reads the post (+ visibility check), the other reads mentioned
    // users -- run together instead of one after another; neither needs the other's result.
    const [post, mentions] = await Promise.all([this.findOneForViewer(postId, authorId), this.resolveMentions(text, authorId)]);
    const comment = await new this.commentModel({
      post: post._id,
      author: new Types.ObjectId(authorId),
      text,
      mentions,
    }).save();

    // Independent post-save side effects (counter bump, gamification points, notifications) --
    // none of these need each other's result, so they run together instead of one after another.
    // Same error-propagation contract as before (any failure here still fails the request, since
    // Promise.all rejects as soon as one does) -- this is purely a latency fix, not a behavior
    // change.
    const notifications: Promise<unknown>[] = [];
    if (post.author && post.author._id.toString() !== authorId) {
      notifications.push(
        this.notificationsService.create({
          recipient: post.author._id,
          actor: authorId,
          type: 'post_comment',
          postId,
          preview: text.slice(0, 120),
        }),
      );
    }
    // The post author already got a post_comment notification above -- skip re-pinging them here
    // as a mention too.
    for (const recipient of mentions) {
      if (post.author && recipient.equals(post.author._id)) continue;
      notifications.push(
        this.notificationsService.create({
          recipient,
          actor: authorId,
          type: 'mention',
          postId,
          preview: text.slice(0, 120),
        }),
      );
    }

    await Promise.all([
      this.postModel.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } }).exec(),
      this.gamificationService.awardPoints(authorId, POINTS.COMMENT_ADDED, 'comment_added'),
      ...notifications,
    ]);

    return comment.populate('author', 'name role photoUrl');
  }

  // Top-level comments only -- replies are fetched per-parent via listReplies().
  async listComments(postId: string, viewerId: string, page = 1, limit = 20): Promise<CommentDocument[]> {
    // 404s if the viewer isn't allowed to see the post the comments belong to.
    await this.findOneForViewer(postId, viewerId);
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
    await this.gamificationService.awardPoints(authorId, POINTS.REPLY_ADDED, 'reply_added');
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
      await this.gamificationService.awardPoints(userId, POINTS.REACTION_GIVEN, 'reaction_given');
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
    const post = await this.findOneForViewer(id, userId);
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

  // Folders for the PDF/video lecture library (components/lectures/LectureFoldersGrid): every
  // explicitly-created LectureFolder, plus a synthetic entry for any courseCode that already has
  // lectures of this type but no folder doc yet (free-typed courseCode from before folders existed,
  // or from the courseCode field on the upload form) -- so nothing already uploaded disappears.
  async listLectureFolders(
    attachmentType: 'lecture' | 'video',
  ): Promise<{ id: string | null; name: string; lectureCount: number; latestAt: Date; createdAt: Date }[]> {
    const [folders, counts] = await Promise.all([
      this.lectureFolderModel
        .find({ attachmentType })
        .sort({ createdAt: -1 })
        .lean<{ _id: Types.ObjectId; name: string; createdAt: Date }[]>()
        .exec(),
      this.postModel.aggregate<{ _id: string; count: number; latestAt: Date }>([
        { $match: { attachmentType, courseCode: { $ne: null } } },
        { $group: { _id: '$courseCode', count: { $sum: 1 }, latestAt: { $max: '$createdAt' } } },
      ]),
    ]);

    const countByName = new Map(counts.map((c) => [c._id, c]));
    const result: { id: string | null; name: string; lectureCount: number; latestAt: Date; createdAt: Date }[] = folders.map((f) => {
      const stats = countByName.get(f.name);
      countByName.delete(f.name);
      return {
        id: f._id.toString(),
        name: f.name,
        lectureCount: stats?.count ?? 0,
        latestAt: stats?.latestAt ?? f.createdAt,
        createdAt: f.createdAt,
      };
    });
    for (const c of countByName.values()) {
      result.push({ id: null, name: c._id, lectureCount: c.count, latestAt: c.latestAt, createdAt: c.latestAt });
    }
    result.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return result;
  }

  // Live lecture count/last-activity for a single folder name, matching the aggregation in
  // listLectureFolders() -- used to return a fully-populated folder (not a bare Mongoose doc) from
  // create/update so the frontend never has to guess/reload to get lectureCount/latestAt.
  private async lectureFolderStats(
    attachmentType: 'lecture' | 'video',
    name: string,
  ): Promise<{ count: number; latestAt: Date | null }> {
    const [stats] = await this.postModel.aggregate<{ count: number; latestAt: Date }>([
      { $match: { attachmentType, courseCode: name } },
      { $group: { _id: null, count: { $sum: 1 }, latestAt: { $max: '$createdAt' } } },
    ]);
    return stats ? { count: stats.count, latestAt: stats.latestAt } : { count: 0, latestAt: null };
  }

  private async toLectureFolderDto(
    folder: LectureFolderDocument,
  ): Promise<{ id: string; name: string; lectureCount: number; latestAt: Date; createdAt: Date }> {
    const stats = await this.lectureFolderStats(folder.attachmentType, folder.name);
    return {
      id: folder._id.toString(),
      name: folder.name,
      lectureCount: stats.count,
      latestAt: stats.latestAt ?? folder.createdAt,
      createdAt: folder.createdAt,
    };
  }

  async createLectureFolder(
    userId: string,
    userRole: Role,
    name: string,
    attachmentType: 'lecture' | 'video',
  ): Promise<{ id: string; name: string; lectureCount: number; latestAt: Date; createdAt: Date }> {
    if (userRole === Role.STUDENT) {
      throw new ForbiddenException('إنشاء المجلدات متاح للمشرفين وأعضاء هيئة التدريس فقط');
    }
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('اسم المجلد مطلوب');

    const existing = await this.lectureFolderModel
      .findOne({ attachmentType, name: trimmed })
      .collation({ locale: 'en', strength: 2 })
      .exec();
    if (existing) throw new BadRequestException('يوجد مجلد بهذا الاسم بالفعل');

    const folder = new this.lectureFolderModel({
      name: trimmed,
      attachmentType,
      createdBy: new Types.ObjectId(userId),
    });
    await folder.save();
    return this.toLectureFolderDto(folder);
  }

  // Renames a folder and re-tags every lecture already filed under its old name (courseCode is the
  // only link between a lecture and its folder -- see the schema comment) so nothing "falls out" of
  // the folder just because it was renamed.
  async updateLectureFolder(
    id: string,
    requesterId: string,
    name: string,
  ): Promise<{ id: string; name: string; lectureCount: number; latestAt: Date; createdAt: Date }> {
    const folder = await this.lectureFolderModel.findById(id).exec();
    if (!folder) throw new NotFoundException('المجلد غير موجود');
    if (folder.createdBy.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك تعديل المجلدات التي أنشأتها فقط');
    }
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('اسم المجلد مطلوب');

    if (trimmed.toLowerCase() !== folder.name.toLowerCase()) {
      const existing = await this.lectureFolderModel
        .findOne({ attachmentType: folder.attachmentType, name: trimmed, _id: { $ne: folder._id } })
        .collation({ locale: 'en', strength: 2 })
        .exec();
      if (existing) throw new BadRequestException('يوجد مجلد بهذا الاسم بالفعل');

      await this.postModel
        .updateMany({ attachmentType: folder.attachmentType, courseCode: folder.name }, { $set: { courseCode: trimmed } })
        .exec();
      folder.name = trimmed;
      await folder.save();
    }
    return this.toLectureFolderDto(folder);
  }

  async deleteLectureFolder(id: string, requesterId: string): Promise<void> {
    const folder = await this.lectureFolderModel.findById(id).exec();
    if (!folder) throw new NotFoundException('المجلد غير موجود');
    if (folder.createdBy.toString() !== requesterId) {
      throw new ForbiddenException('يمكنك حذف المجلدات التي أنشأتها فقط');
    }
    await folder.deleteOne();
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

  private async dailyComments(days: number): Promise<DailyCount[]> {
    const rows = await this.commentModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: daysAgoStart(days) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ])
      .exec();
    return fillDailyCounts(rows, days);
  }

  // Posts / comments over the trailing `days` window + period-over-period totals (admin console).
  async getPostTrend(days: number): Promise<TrendSeries> {
    const [series, current, previous] = await Promise.all([
      this.dailyPosts(days),
      this.postModel.countDocuments({ createdAt: { $gte: daysAgoStart(days) } }).exec(),
      this.postModel.countDocuments({ createdAt: previousWindowMatch(days) }).exec(),
    ]);
    return { series, current, previous };
  }

  async getCommentTrend(days: number): Promise<TrendSeries> {
    const [series, current, previous] = await Promise.all([
      this.dailyComments(days),
      this.commentModel.countDocuments({ createdAt: { $gte: daysAgoStart(days) } }).exec(),
      this.commentModel.countDocuments({ createdAt: previousWindowMatch(days) }).exec(),
    ]);
    return { series, current, previous };
  }
}
