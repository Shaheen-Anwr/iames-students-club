import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { purposeTag, StorageService } from '../upload/storage.service';
import { StreamService } from '../stream/stream.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { ChatStatus, ChatStatusDocument } from './schemas/chat-status.schema';
import { CreateChatStatusDto } from './dto/create-chat-status.dto';

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STATUS_VIDEO_MAX_SEC = 60;
// Story uploads older than this are never needed again (a story lives 24h) -- the hourly sweep
// deletes them from Cloudinary / Cloudflare Stream, whether the story expired or was never posted.
const STATUS_VIDEO_SWEEP_AGE_MS = STATUS_LIFETIME_MS + 60 * 60 * 1000;

interface StatusVideo {
  videoProvider: 'cloudinary' | 'stream';
  videoUrl: string;
  videoUid: string | null;
  posterUrl: string | null;
  durationSec: number | null;
}

// First-frame-ish JPEG of a Cloudinary video, keeping its aspect ratio (story posters aren't
// cropped like reel thumbnails). A clip under 2s uses its very first frame.
function cloudinaryPoster(videoUrl: string, durationSec: number | null): string | null {
  const marker = '/upload/';
  const i = videoUrl.indexOf(marker);
  if (i < 0) return null;
  const offset = (durationSec ?? 0) >= 2 ? 1 : 0;
  const tail = videoUrl.slice(i + marker.length).replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
  return `${videoUrl.slice(0, i + marker.length)}so_${offset},w_720,c_limit,f_jpg,q_auto/${tail}`;
}

@Injectable()
export class ChatStatusService {
  private readonly logger = new Logger(ChatStatusService.name);

  constructor(
    @InjectModel(ChatStatus.name) private readonly statuses: Model<ChatStatusDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Conversation.name) private readonly conversations: Model<ConversationDocument>,
    private readonly modules: ModuleRef,
    private readonly storage: StorageService,
    private readonly stream: StreamService,
  ) {}

  async list(userId: string) {
    const uid = new Types.ObjectId(userId);
    const [viewer, direct] = await Promise.all([
      this.users.findById(uid).select('friends blockedUsers').lean().exec(),
      this.conversations.find({ participants: uid, isGroup: false }).select('participants').lean().exec(),
    ]);
    if (!viewer) throw new NotFoundException('المستخدم غير موجود');
    const candidates = new Set<string>([userId, ...(viewer.friends ?? []).map(String)]);
    direct.forEach((conversation) => conversation.participants.forEach((id) => candidates.add(String(id))));
    // Check both sides of a block in one query. Group membership alone does not make every
    // classmate a contact; only friends and people with an existing DM can see the status.
    const authors = await this.users.find({
      _id: { $in: [...candidates].map((id) => new Types.ObjectId(id)), $nin: viewer.blockedUsers ?? [] },
      blockedUsers: { $ne: uid },
    }).select('_id').lean().exec();
    return this.statuses.find({ author: { $in: authors.map((author) => author._id) }, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 }).limit(200).populate('author', 'name photoUrl').exec();
  }

  async create(userId: string, input: CreateChatStatusDto) {
    const text = (input.text ?? '').trim();
    const wantsVideo = !!(input.publicIds?.length || input.streamUid);
    if (wantsVideo && input.imageUrl) throw new BadRequestException('اختر صورة أو فيديو للحالة، وليس الاثنين');
    if (!text && !input.imageUrl && !wantsVideo) throw new BadRequestException('أضف نصًا أو صورة أو فيديو للحالة');
    if (text.length > 600) throw new BadRequestException('الحد الأقصى 600 حرف');

    // Ownership is verified first; from then on any failure deletes the just-uploaded video
    // instead of leaving it stranded in storage.
    const video = wantsVideo ? await this.resolveVideo(userId, input) : null;
    try {
      const now = new Date();
      const active = await this.statuses.countDocuments({ author: new Types.ObjectId(userId), expiresAt: { $gt: now } });
      if (active >= 5) throw new BadRequestException('يمكنك مشاركة خمس حالات خلال 24 ساعة، احذف حالة أولًا');
      await this.moderate(text);
      const status = await this.statuses.create({
        author: new Types.ObjectId(userId), text, imageUrl: input.imageUrl ?? null,
        ...(video ?? {}),
        expiresAt: new Date(now.getTime() + STATUS_LIFETIME_MS),
      });
      return status.populate('author', 'name photoUrl');
    } catch (err) {
      if (video) void this.destroyVideo(video);
      throw err;
    }
  }

  async remove(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الحالة غير موجودة');
    const removed = await this.statuses
      .findOneAndDelete({ _id: new Types.ObjectId(id), author: new Types.ObjectId(userId) })
      .lean()
      .exec();
    if (!removed) throw new NotFoundException('الحالة غير موجودة');
    if (removed.videoProvider && removed.videoUrl) {
      void this.destroyVideo({
        videoProvider: removed.videoProvider, videoUrl: removed.videoUrl, videoUid: removed.videoUid,
        posterUrl: null, durationSec: null,
      });
    }
    return { success: true };
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'chat-status-video-sweep' })
  async sweepOldVideos(): Promise<void> {
    const [cloudinary, stream] = await Promise.all([
      this.storage.sweepTaggedVideos(purposeTag('status'), STATUS_VIDEO_SWEEP_AGE_MS),
      this.stream.sweepStatusVideos(STATUS_VIDEO_SWEEP_AGE_MS),
    ]);
    if (cloudinary + stream > 0) this.logger.log(`Deleted ${cloudinary + stream} expired story video(s).`);
  }

  // Accepts only this user's own story upload (Stream: creator + meta.purpose; Cloudinary: the
  // signed owner_/purpose_status tags) -- the video gets deleted later, so it must be theirs.
  private async resolveVideo(userId: string, input: CreateChatStatusDto): Promise<StatusVideo> {
    let video: StatusVideo;
    if (input.streamUid) {
      if (!this.stream.isConfigured) throw new BadRequestException('رفع الفيديو غير متاح حاليًا');
      const status = await this.stream.getStatus(input.streamUid);
      if (status.creator !== userId || status.purpose !== 'status') {
        throw new BadRequestException('الفيديو المرفوع غير مطابق للمتوقع');
      }
      if (!status.ready) throw new BadRequestException('الفيديو لا يزال قيد المعالجة، حاول مرة أخرى بعد قليل');
      video = {
        videoProvider: 'stream', videoUrl: status.playbackUrl, videoUid: status.uid,
        posterUrl: status.thumbnailUrl, durationSec: status.durationSec || null,
      };
    } else {
      const outcome = await this.storage.confirmDirectUpload('videos', input.publicIds ?? [], { ownerId: userId, purpose: 'status' });
      const durationSec = outcome.durationSec ? Math.round(outcome.durationSec) : null;
      video = {
        videoProvider: 'cloudinary', videoUrl: outcome.url, videoUid: null,
        posterUrl: cloudinaryPoster(outcome.url, durationSec), durationSec,
      };
    }
    // A second of slack for container rounding; the browser already refuses anything longer.
    if ((video.durationSec ?? 0) > STATUS_VIDEO_MAX_SEC + 1) {
      void this.destroyVideo(video);
      throw new BadRequestException('الحد الأقصى لفيديو الحالة 60 ثانية');
    }
    return video;
  }

  private destroyVideo(video: StatusVideo): Promise<void> {
    return video.videoProvider === 'stream' && video.videoUid
      ? this.stream.deleteVideo(video.videoUid)
      : this.storage.destroyVideoByUrl(video.videoUrl);
  }

  private async moderate(text: string) {
    if (!text) return;
    // Same contact-information floor and fail-open AI policy used on the student wall.
    if (/\b\d{7,}\b/.test(text) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) {
      throw new BadRequestException('لا تنشر أرقام هواتف أو بريدًا إلكترونيًا في الحالة');
    }
    let result: { allowed?: boolean; reason?: string } | undefined;
    try {
      // AiModule already imports ChatModule. Resolve lazily after bootstrap to reuse its AI
      // client without introducing a circular module dependency just for text moderation.
      const ai = this.modules.get(AiService, { strict: false });
      if (!ai?.isConfigured) return;
      // The model only ever sees the caption -- say so, or it invents rules about the photo/video a
      // caption mentions (it rejected "أول حالة فيديو" as "Video content not allowed").
      result = await ai.completeJson<{ allowed?: boolean; reason?: string }>(
        'أنت مشرف نصوص الحالات الطلابية. الحالة قد تكون نصًا فقط أو صورة أو فيديو مع تعليق، وأنت تحكم على النص المكتوب وحده. ' +
        'ذكر صورة أو فيديو أو تسجيل أو محاضرة مسموح تمامًا وليس سببًا للمنع. ' +
        'امنع فقط: التنمر الموجه، والتهديد، والعنف، والكراهية، والمحتوى الجنسي الصريح، وكشف معلومات خاصة. ' +
        'اسمح بالدردشة والنقد والطرافة والإيموجي. أعد JSON فقط: {"allowed": boolean, "reason": "سبب قصير بالعربية"}.',
        text, { maxTokens: 200, temperature: 0, timeoutMs: 15_000 },
      );
    } catch (error) {
      this.logger.warn(`Status text moderation unavailable: ${(error as Error).message}`);
    }
    if (result?.allowed === false) {
      // Users read this in a toast -- never pass an English (or empty) model reason through.
      const reason = result.reason && /[\u0600-\u06FF]/.test(result.reason) ? result.reason : 'الحالة مخالفة لقواعد المنصة';
      throw new BadRequestException(reason);
    }
  }
}
