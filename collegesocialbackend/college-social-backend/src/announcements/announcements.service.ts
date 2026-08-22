import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schemas/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';

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
  constructor(@InjectModel(Announcement.name) private announcementModel: Model<AnnouncementDocument>) {}

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
    return announcement.save();
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
