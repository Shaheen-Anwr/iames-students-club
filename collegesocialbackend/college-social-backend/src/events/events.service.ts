import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event, EventDocument } from './schemas/event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

interface Organiser {
  _id: Types.ObjectId;
  name?: string;
  photoUrl?: string | null;
  role?: string;
}

export interface EventView {
  _id: string;
  title: string;
  description: string;
  location: string;
  organizer: string;
  startsAt: Date;
  endsAt: Date | null;
  department: Department | null;
  capacity: number | null;
  attendeeCount: number;
  going: boolean;
  mine: boolean;
  full: boolean;
  createdBy: { _id: string; name: string; photoUrl: string | null; role: string } | null;
  createdAt: Date;
}

@Injectable()
export class EventsService {
  constructor(@InjectModel(Event.name) private readonly model: Model<EventDocument>) {}

  private toView(doc: EventDocument, viewerId: string): EventView {
    const populated = doc.createdBy as unknown as Organiser | null;
    const organiser =
      populated && populated._id
        ? {
            _id: populated._id.toString(),
            name: populated.name ?? 'مستخدم محذوف',
            photoUrl: populated.photoUrl ?? null,
            role: populated.role ?? 'student',
          }
        : null;
    const count = doc.attendees.length;
    return {
      _id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      location: doc.location,
      organizer: doc.organizer,
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      department: doc.department,
      capacity: doc.capacity,
      attendeeCount: count,
      going: doc.attendees.some((a) => a.toString() === viewerId),
      mine: organiser?._id === viewerId,
      full: doc.capacity != null && count >= doc.capacity,
      createdBy: organiser,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    };
  }

  async list(
    user: AuthenticatedUser,
    scope: 'upcoming' | 'past',
    page = 1,
    limit = 20,
  ): Promise<EventView[]> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const now = new Date();
    const docs = await this.model
      .find({
        $or: [{ department: null }, { department: user.department ?? null }],
        startsAt: scope === 'upcoming' ? { $gte: now } : { $lt: now },
      })
      .sort({ startsAt: scope === 'upcoming' ? 1 : -1 })
      .skip((page - 1) * capped)
      .limit(capped)
      .populate('createdBy', 'name photoUrl role')
      .exec();
    return docs.map((d) => this.toView(d, user.userId));
  }

  async create(user: AuthenticatedUser, dto: CreateEventDto): Promise<EventView> {
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('تاريخ غير صالح');
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('وقت الانتهاء يجب أن يكون بعد البداية');
    }

    const doc = await this.model.create({
      createdBy: new Types.ObjectId(user.userId),
      title: dto.title,
      description: dto.description ?? '',
      location: dto.location ?? '',
      organizer: dto.organizer ?? '',
      startsAt,
      endsAt,
      department: user.department ?? null,
      capacity: dto.capacity ?? null,
      attendees: [new Types.ObjectId(user.userId)], // the creator is going by default
    });
    await doc.populate('createdBy', 'name photoUrl role');
    return this.toView(doc, user.userId);
  }

  async rsvp(user: AuthenticatedUser, id: string): Promise<{ going: boolean; attendeeCount: number }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الفعالية غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الفعالية غير موجودة');

    const idx = doc.attendees.findIndex((a) => a.toString() === user.userId);
    if (idx >= 0) {
      doc.attendees.splice(idx, 1);
    } else {
      if (doc.capacity != null && doc.attendees.length >= doc.capacity) {
        throw new BadRequestException('اكتمل العدد لهذه الفعالية');
      }
      doc.attendees.push(new Types.ObjectId(user.userId));
    }
    await doc.save();
    return { going: idx < 0, attendeeCount: doc.attendees.length };
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الفعالية غير موجودة');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الفعالية غير موجودة');
    if (doc.createdBy.toString() !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('لا تملك صلاحية حذف هذه الفعالية');
    }
    await doc.deleteOne();
  }
}
