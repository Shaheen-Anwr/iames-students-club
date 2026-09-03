import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { WallPost, WallPostDocument } from './schemas/wall-post.schema';
import { WallComment, WallCommentDocument } from './schemas/wall-comment.schema';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { decodeCursor, keysetMatch, KEYSET_SORT, nextCursorFrom } from '../common/pagination/cursor.util';

const MAX_BODY = 600;
const DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// Distinct reporters at which a post auto-hides pending admin review.
const AUTO_HIDE_REPORTS = 3;

// A tiny, unambiguous floor that runs even when the AI moderator is off -- it only targets
// doxxing (contact details posted on an anonymous wall). Everything subjective (bullying, hate,
// threats) is left to the AI pass below, with admin hide as the backstop.
const BLOCKLIST: RegExp[] = [
  /\b\d{7,}\b/, // long digit runs -- phone numbers / national IDs
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email addresses
];

export interface WallPostView {
  _id: string;
  authorHash: string;
  department: Department | null;
  body: string;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  mine: boolean;
  createdAt: Date;
}

export interface WallCommentView {
  _id: string;
  authorHash: string;
  body: string;
  mine: boolean;
  createdAt: Date;
}

@Injectable()
export class WallService {
  private readonly logger = new Logger(WallService.name);
  private readonly salt: string;

  constructor(
    @InjectModel(WallPost.name) private readonly model: Model<WallPostDocument>,
    @InjectModel(WallComment.name) private readonly commentModel: Model<WallCommentDocument>,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    // Reuse the JWT secret as the hash salt -- already a high-entropy server secret, and rotating
    // it (which would reshuffle every pseudonym) is already a deliberate, disruptive act.
    this.salt = config.get<string>('jwt.secret') ?? 'wall-fallback-salt';
  }

  hashFor(userId: string): string {
    return createHash('sha256').update(`${userId}:${this.salt}`).digest('hex').slice(0, 8);
  }

  private toView(doc: WallPostDocument, viewerId: string, viewerHash: string): WallPostView {
    return {
      _id: doc._id.toString(),
      authorHash: doc.authorHash,
      department: doc.department,
      body: doc.body,
      likeCount: doc.likes.length,
      liked: doc.likes.some((l) => l.toString() === viewerId),
      commentCount: doc.commentCount ?? 0,
      mine: doc.authorHash === viewerHash,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    };
  }

  private keywordReject(body: string): boolean {
    return BLOCKLIST.some((re) => re.test(body));
  }

  // Returns { blocked, reason }. Fails OPEN -- if the model errors or isn't configured, the post
  // is allowed (the keyword floor + admin hide still apply). Moderation should never be a hard
  // outage for posting.
  private async aiModerate(body: string): Promise<{ blocked: boolean; reason: string }> {
    if (!this.ai.isConfigured) return { blocked: false, reason: '' };
    try {
      const res = await this.ai.completeJson<{ allowed?: boolean; reason?: string }>(
        'أنت مشرف محتوى لجدار طلابي مجهول داخل كلية. احكم على النص التالي. امنع فقط: التنمّر أو ' +
          'الإهانة الموجهة لشخص بعينه، التهديد أو التحريض على العنف، خطاب الكراهية ضد فئة، المحتوى ' +
          'الجنسي الصريح، أو كشف معلومات خاصة عن شخص. النقد العام والشكوى والطرافة والدردشة العادية ' +
          'كلها مسموحة. أعِد كائن JSON فقط: {"allowed": boolean, "reason": "سبب قصير جدًا عند المنع"}.',
        body,
        { maxTokens: 200, temperature: 0, timeoutMs: 15_000 },
      );
      return { blocked: res.allowed === false, reason: (res.reason ?? '').trim() || 'مخالف لقواعد الجدار' };
    } catch (err) {
      this.logger.warn(`wall AI moderation failed -- allowing post: ${(err as Error).message}`);
      return { blocked: false, reason: '' };
    }
  }

  async create(user: AuthenticatedUser, bodyRaw: string): Promise<WallPostView> {
    const body = (bodyRaw ?? '').trim();
    if (body.length < 2) throw new BadRequestException('المنشور قصير جدًا');
    if (body.length > MAX_BODY) throw new BadRequestException(`الحد الأقصى ${MAX_BODY} حرفًا`);

    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.model.countDocuments({
      authorId: new Types.ObjectId(user.userId),
      createdAt: { $gte: since },
    });
    if (recent >= DAILY_LIMIT) {
      throw new BadRequestException(`يمكنك نشر ${DAILY_LIMIT} منشورات كحد أقصى خلال 24 ساعة`);
    }

    if (this.keywordReject(body)) {
      throw new BadRequestException('لا تنشر أرقام هواتف أو بريدًا إلكترونيًا على الجدار.');
    }
    const mod = await this.aiModerate(body);
    if (mod.blocked) throw new BadRequestException(mod.reason);

    const hash = this.hashFor(user.userId);
    const doc = await this.model.create({
      authorId: new Types.ObjectId(user.userId),
      authorHash: hash,
      department: user.department ?? null,
      body,
    });
    return this.toView(doc, user.userId, hash);
  }

  private baseListFilter(user: AuthenticatedUser): Record<string, unknown> {
    return { hidden: false, $or: [{ department: null }, { department: user.department ?? null }] };
  }

  async list(
    user: AuthenticatedUser,
    page = 1,
    limit = 20,
    sort: 'new' | 'top' = 'new',
  ): Promise<WallPostView[]> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const docs = await this.model
      .find(this.baseListFilter(user))
      .sort(sort === 'top' ? { likes: -1, createdAt: -1 } : { createdAt: -1 })
      .skip((page - 1) * capped)
      .limit(capped)
      .exec();
    const hash = this.hashFor(user.userId);
    return docs.map((d) => this.toView(d, user.userId, hash));
  }

  // Cursor-paginated wall. `sort: 'new'` uses a real keyset cursor on createdAt/_id (index range
  // read at any depth). `sort: 'top'` sorts on the `likes` array (multikey -- can't keyset), so
  // its "cursor" is just an opaque page token ("p2", "p3", ...) over the same skip/limit as list().
  // Either way the response shape is the same: { items, nextCursor }.
  async listCursor(
    user: AuthenticatedUser,
    before: string | undefined,
    limit = 20,
    sort: 'new' | 'top' = 'new',
  ): Promise<{ items: WallPostView[]; nextCursor: string | null }> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const hash = this.hashFor(user.userId);

    if (sort === 'top') {
      const page = before?.startsWith('p') ? Math.max(1, Number(before.slice(1)) || 1) : 1;
      const docs = await this.model
        .find(this.baseListFilter(user))
        .sort({ likes: -1, createdAt: -1 })
        .skip((page - 1) * capped)
        .limit(capped)
        .exec();
      return {
        items: docs.map((d) => this.toView(d, user.userId, hash)),
        nextCursor: docs.length === capped ? `p${page + 1}` : null,
      };
    }

    const cur = decodeCursor(before);
    const filter = cur ? { ...this.baseListFilter(user), ...keysetMatch(cur) } : this.baseListFilter(user);
    const docs = await this.model.find(filter).sort(KEYSET_SORT).limit(capped).exec();
    return {
      items: docs.map((d) => this.toView(d, user.userId, hash)),
      nextCursor: nextCursorFrom(docs, capped),
    };
  }

  async toggleLike(user: AuthenticatedUser, id: string): Promise<{ liked: boolean; likeCount: number }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المنشور غير موجود');
    const doc = await this.model.findById(id).exec();
    if (!doc || doc.hidden) throw new NotFoundException('المنشور غير موجود');

    const idx = doc.likes.findIndex((l) => l.toString() === user.userId);
    if (idx >= 0) doc.likes.splice(idx, 1);
    else doc.likes.push(new Types.ObjectId(user.userId));
    await doc.save();
    return { liked: idx < 0, likeCount: doc.likes.length };
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المنشور غير موجود');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('المنشور غير موجود');
    if (doc.authorId.toString() !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('لا تملك صلاحية حذف هذا المنشور');
    }
    await Promise.all([doc.deleteOne(), this.commentModel.deleteMany({ post: doc._id }).exec()]);
  }

  /* --------------------------------- comments -------------------------------- */

  async listComments(user: AuthenticatedUser, postId: string): Promise<WallCommentView[]> {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('المنشور غير موجود');
    const docs = await this.commentModel
      .find({ post: new Types.ObjectId(postId) })
      .sort({ createdAt: 1 })
      .limit(200)
      .exec();
    const hash = this.hashFor(user.userId);
    return docs.map((c) => ({
      _id: c._id.toString(),
      authorHash: c.authorHash,
      body: c.body,
      mine: c.authorHash === hash,
      createdAt: (c as unknown as { createdAt: Date }).createdAt,
    }));
  }

  async addComment(user: AuthenticatedUser, postId: string, bodyRaw: string): Promise<WallCommentView> {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('المنشور غير موجود');
    const post = await this.model.findById(postId).exec();
    if (!post || post.hidden) throw new NotFoundException('المنشور غير موجود');

    const body = (bodyRaw ?? '').trim();
    if (body.length < 1) throw new BadRequestException('التعليق فارغ');
    if (body.length > 400) throw new BadRequestException('الحد الأقصى 400 حرفًا');
    if (this.keywordReject(body)) {
      throw new BadRequestException('لا تنشر أرقام هواتف أو بريدًا إلكترونيًا.');
    }

    const hash = this.hashFor(user.userId);
    const doc = await this.commentModel.create({
      post: post._id,
      authorId: new Types.ObjectId(user.userId),
      authorHash: hash,
      body,
    });
    await this.model.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } }).exec();

    // Notify the (anonymous) post author -- unless they're the one commenting. The notification
    // itself carries the commenter as `actor`, but the wall pseudonymises identity elsewhere so
    // this only reveals "someone replied", landing them on /wall. Fire-and-forget.
    if (post.authorId.toString() !== user.userId) {
      void this.notifications
        .create({
          recipient: post.authorId.toString(),
          actor: user.userId,
          type: 'wall_comment',
          preview: body.slice(0, 80),
        })
        .catch(() => undefined);
    }

    return {
      _id: doc._id.toString(),
      authorHash: hash,
      body,
      mine: true,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    };
  }

  async removeComment(user: AuthenticatedUser, commentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(commentId)) throw new NotFoundException('التعليق غير موجود');
    const doc = await this.commentModel.findById(commentId).exec();
    if (!doc) throw new NotFoundException('التعليق غير موجود');
    if (doc.authorId.toString() !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('لا تملك صلاحية حذف هذا التعليق');
    }
    await doc.deleteOne();
    await this.model.updateOne({ _id: doc.post }, { $inc: { commentCount: -1 } }).exec();
  }

  // A student flags a post. Idempotent per user. Auto-hides at AUTO_HIDE_REPORTS distinct
  // reporters -- the post stays out of every feed until an admin restores or deletes it.
  async report(user: AuthenticatedUser, id: string): Promise<{ reported: true; hidden: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المنشور غير موجود');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('المنشور غير موجود');
    if (doc.authorId.toString() === user.userId) {
      throw new BadRequestException('لا يمكنك الإبلاغ عن منشورك');
    }
    const uid = new Types.ObjectId(user.userId);
    if (!doc.reports.some((r) => r.toString() === user.userId)) doc.reports.push(uid);
    if (!doc.hidden && doc.reports.length >= AUTO_HIDE_REPORTS) {
      doc.hidden = true;
      doc.moderationNote = `إخفاء تلقائي بعد ${doc.reports.length} بلاغات`;
    }
    await doc.save();
    return { reported: true, hidden: doc.hidden };
  }

  // Admin-only (guarded at the controller). Hide/restore a post.
  async setHidden(id: string, hidden: boolean): Promise<{ hidden: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المنشور غير موجود');
    const doc = await this.model.findByIdAndUpdate(
      id,
      { hidden, moderationNote: hidden ? 'إخفاء من مشرف' : null },
      { new: true },
    );
    if (!doc) throw new NotFoundException('المنشور غير موجود');
    return { hidden: doc.hidden };
  }
}
