import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schemas/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { buildAnnouncementPushPayload } from '../push/push-payload.util';

export interface PaginatedAnnouncements {
  data: AnnouncementDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface AnnouncementStats {
  total: number;
  pinned: number;
  platformWide: number;
  byDepartment: Record<string, number>;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectModel(Announcement.name) private announcementModel: Model<AnnouncementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  async create(authorId: string, authorDepartment: Department | null, dto: CreateAnnouncementDto): Promise<AnnouncementDocument> {
    // Omitted -> defaults to the author's own department (null for an author without one, which
    // makes it platform-wide). Explicitly sending `department: null` also means platform-wide,
    // even for an author who does have a department -- an intentional override.
    const department = dto.department === undefined ? authorDepartment : dto.department;
    const announcement = new this.announcementModel({
      author: new Types.ObjectId(authorId),
      title: dto.title,
      body: dto.body,
      department,
      pinned: dto.pinned ?? false,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : null,
    });
    await announcement.save();

    // Fan the announcement out to every user who can see it: an in-app notification each (so a
    // missed push still leaves a record) plus a best-effort Web Push. The author is excluded --
    // they just wrote it. Failures here must never fail the announcement itself.
    void this.broadcast(announcement, authorId).catch((err) =>
      this.logger.warn(`Announcement broadcast failed: ${(err as Error)?.message ?? err}`),
    );

    // Populate the author so the caller (and the optimistic insert on the client) can show the
    // announcer's name/photo without a refetch -- same populate list() uses.
    return announcement.populate('author', 'name role photoUrl');
  }

  // Recipients: everyone for a platform-wide announcement (department: null), otherwise only
  // users in that department -- the same visibility split as list().
  private async broadcast(announcement: AnnouncementDocument, authorId: string): Promise<void> {
    const recipientFilter: Record<string, unknown> = { _id: { $ne: new Types.ObjectId(authorId) } };
    if (announcement.department !== null) recipientFilter.department = announcement.department;

    const [recipients, author] = await Promise.all([
      this.userModel.find(recipientFilter).select('_id').lean().exec(),
      this.userModel.findById(authorId).select('name photoUrl role').lean().exec(),
    ]);
    const ids = recipients.map((u) => u._id as Types.ObjectId);
    if (ids.length === 0) return;

    // Carry the announcement's author as the notification `actor` so the student sees who posted
    // it (photo + name), the same as any other notification -- not an anonymous megaphone.
    await this.notificationsService.createSystemBroadcast(
      ids,
      {
        title: announcement.title,
        preview: announcement.body.length > 200 ? `${announcement.body.slice(0, 199)}…` : announcement.body,
        link: '/announcements',
      },
      authorId,
    );

    const frontendUrl = this.config.get<string>('frontendUrl')!;
    await this.pushService.sendToUsers(
      ids.map((id) => id.toString()),
      buildAnnouncementPushPayload(announcement, frontendUrl, author?.name),
    );
  }

  // Platform-wide (department: null) announcements are visible to everyone; department-scoped
  // ones only to viewers in that same department -- same split as Post/Question feeds.
  async list(page = 1, limit = 20, viewerDepartment?: Department | null): Promise<AnnouncementDocument[]> {
    const filter = { $or: [{ department: null }, { department: viewerDepartment ?? null }] };
    return this.announcementModel
      .find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'name role photoUrl')
      .exec();
  }

  // Count of announcements a viewer in `viewerDepartment` can see that were posted on/after
  // `since` -- used by the morning digest to tell a student how many landed overnight. Same
  // visibility split as list().
  async countSince(since: Date, viewerDepartment?: Department | null): Promise<number> {
    return this.announcementModel
      .countDocuments({
        createdAt: { $gte: since },
        $or: [{ department: null }, { department: viewerDepartment ?? null }],
      })
      .exec();
  }

  // Used by CalendarService to pull the month's dated announcements.
  async findEventsInRange(start: Date, end: Date, viewerDepartment?: Department | null): Promise<AnnouncementDocument[]> {
    return this.announcementModel
      .find({
        eventDate: { $gte: start, $lt: end },
        $or: [{ department: null }, { department: viewerDepartment ?? null }],
      })
      .sort({ eventDate: 1 })
      .exec();
  }

  async remove(id: string, requesterId: string, requesterRole: Role): Promise<void> {
    const announcement = await this.announcementModel.findById(id).exec();
    if (!announcement) throw new NotFoundException('الإعلان غير موجود');
    if (announcement.author.toString() !== requesterId && requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('يمكنك حذف إعلاناتك فقط');
    }
    await this.announcementModel.findByIdAndDelete(id).exec();
  }

  // --- Admin-only operations (guarded at the controller level) ---

  // Unlike list(), not department-filtered -- an admin can see every announcement.
  async adminList(page = 1, limit = 20, search?: string): Promise<PaginatedAnnouncements> {
    const filter = search ? { title: { $regex: search, $options: 'i' } } : {};
    const [data, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ pinned: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name role photoUrl')
        .exec(),
      this.announcementModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  async getStats(): Promise<AnnouncementStats> {
    const [total, pinned, platformWide, byDepartmentRows] = await Promise.all([
      this.announcementModel.countDocuments().exec(),
      this.announcementModel.countDocuments({ pinned: true }).exec(),
      this.announcementModel.countDocuments({ department: null }).exec(),
      this.announcementModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { department: { $ne: null } } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const byDepartment = Object.fromEntries(byDepartmentRows.map((r) => [r._id, r.count]));
    return { total, pinned, platformWide, byDepartment };
  }
}
