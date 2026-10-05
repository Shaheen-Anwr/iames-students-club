import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostAttachmentType, PostDocument, PostScope } from '../posts/schemas/post.schema';
import { Assignment, AssignmentDocument } from '../assignments/schemas/assignment.schema';
import { Event, EventDocument } from '../events/schemas/event.schema';
import { Listing, ListingDocument } from '../marketplace/schemas/listing.schema';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import { Role } from '../common/enums/role.enum';
import type { MessageCard } from './schemas/message.schema';
import type { SHAREABLE_CARD_KINDS } from './dto/create-message.dto';

type ShareableKind = (typeof SHAREABLE_CARD_KINDS)[number];

interface Viewer {
  id: string;
  role: string;
  department: string | null;
  academicYear: string | null;
}

export interface CardSuggestions {
  lectures: MessageCard[];
  assignments: MessageCard[];
  events: MessageCard[];
  listings: MessageCard[];
}

const SUGGESTION_LIMIT = 8;

function firstLine(text: string | null | undefined, max = 90): string {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Builds "cards" -- platform items shared into a chat (a lecture or post, an assignment, an event,
// a marketplace listing). The card is a snapshot taken from the real document at send time, so a
// client can only ever share something by reference, never invent a title or link; and the
// sender must be able to see the item themself (the شعبة wall applies to students). Opening the
// card re-checks access on the target page, so a card can't smuggle content past the wall either.
@Injectable()
export class ChatCardsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Assignment.name) private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(Listing.name) private readonly listingModel: Model<ListingDocument>,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
  ) {}

  async resolve(userId: string, kind: ShareableKind, refId: string): Promise<MessageCard> {
    if (!Types.ObjectId.isValid(refId)) throw new NotFoundException('العنصر غير موجود');
    const viewer = await this.viewer(userId);
    switch (kind) {
      case 'post':
        return this.postCard(viewer, refId);
      case 'assignment':
        return this.assignmentCard(viewer, refId);
      case 'event':
        return this.eventCard(viewer, refId);
      case 'listing':
        return this.listingCard(viewer, refId);
    }
  }

  // What the composer's "share from the platform" picker offers: this student's recent lectures,
  // upcoming assignments and events, and available listings -- all within their شعبة.
  async suggestions(userId: string): Promise<CardSuggestions> {
    const viewer = await this.viewer(userId);
    const now = new Date();
    const deptFilter = this.isStaff(viewer) ? {} : { department: { $in: [viewer.department, null] } };
    const uid = new Types.ObjectId(userId);

    const [lectures, assignments, events, listings] = await Promise.all([
      this.postModel
        .find({
          attachmentType: { $in: [PostAttachmentType.LECTURE, PostAttachmentType.VIDEO] },
          scope: { $in: [PostScope.PUBLIC, PostScope.DEPARTMENT] },
          ...(this.isStaff(viewer)
            ? {}
            : { department: viewer.department, ...(viewer.academicYear ? { academicYear: { $in: [viewer.academicYear, null] } } : {}) }),
        })
        .sort({ createdAt: -1 })
        .limit(SUGGESTION_LIMIT)
        .exec(),
      this.assignmentModel
        .find({
          dueDate: { $gte: now },
          isMilitary: { $ne: true },
          group: null,
          $or: [{ isPersonal: { $ne: true }, ...deptFilter }, { isPersonal: true, createdBy: uid }],
        })
        .sort({ dueDate: 1 })
        .limit(SUGGESTION_LIMIT)
        .exec(),
      this.eventModel
        .find({ startsAt: { $gte: now }, ...deptFilter })
        .sort({ startsAt: 1 })
        .limit(SUGGESTION_LIMIT)
        .exec(),
      this.listingModel
        .find({ status: 'available', ...deptFilter })
        .sort({ createdAt: -1 })
        .limit(SUGGESTION_LIMIT)
        .exec(),
    ]);

    return {
      lectures: lectures.map((p) => this.buildPostCard(p)),
      assignments: assignments.map((a) => this.buildAssignmentCard(a)),
      events: events.map((e) => this.buildEventCard(e)),
      listings: listings.map((l) => this.buildListingCard(l)),
    };
  }

  // --- per kind ---

  private async postCard(viewer: Viewer, id: string): Promise<MessageCard> {
    const post = await this.postModel.findById(id).exec();
    if (!post) throw new NotFoundException('المنشور غير موجود');
    const ownPost = post.author?.toString() === viewer.id;
    if (!ownPost) {
      if (post.scope === PostScope.PRIVATE) throw new ForbiddenException('لا يمكنك مشاركة هذا المنشور');
      if (post.scope === PostScope.FRIENDS) {
        const author = await this.usersService.findById(post.author.toString()).catch(() => null);
        if (!author?.friends?.some((f) => f.toString() === viewer.id)) {
          throw new ForbiddenException('لا يمكنك مشاركة هذا المنشور');
        }
      }
      this.assertDepartment(viewer, post.department);
    }
    return this.buildPostCard(post);
  }

  private async assignmentCard(viewer: Viewer, id: string): Promise<MessageCard> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) throw new NotFoundException('الواجب غير موجود');
    if (assignment.group) await this.groupsService.assertMember(String(assignment.group), viewer.id);
    if (assignment.isPersonal && assignment.createdBy.toString() !== viewer.id) {
      throw new ForbiddenException('لا يمكنك مشاركة هذا الواجب');
    }
    if (!assignment.isPersonal) this.assertDepartment(viewer, assignment.department);
    return this.buildAssignmentCard(assignment);
  }

  private async eventCard(viewer: Viewer, id: string): Promise<MessageCard> {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    this.assertDepartment(viewer, event.department);
    return this.buildEventCard(event);
  }

  private async listingCard(viewer: Viewer, id: string): Promise<MessageCard> {
    const listing = await this.listingModel.findById(id).exec();
    if (!listing) throw new NotFoundException('الإعلان غير موجود');
    this.assertDepartment(viewer, listing.department);
    return this.buildListingCard(listing);
  }

  // --- snapshots ---

  private buildPostCard(post: PostDocument): MessageCard {
    const isLecture = post.attachmentType === PostAttachmentType.LECTURE;
    const isVideo = post.attachmentType === PostAttachmentType.VIDEO;
    const title =
      firstLine(post.caption) ||
      (post.attachmentOriginalName ? firstLine(post.attachmentOriginalName) : '') ||
      (isLecture ? 'محاضرة' : isVideo ? 'فيديو' : 'منشور');
    const kindLabel = isLecture ? 'محاضرة' : isVideo ? 'فيديو محاضرة' : 'منشور';
    return {
      kind: 'post',
      refId: String(post._id),
      title,
      subtitle: post.courseCode ? `${kindLabel} · ${post.courseCode}` : kindLabel,
      imageUrl: post.images?.[0] ?? null,
      href: `/posts/${String(post._id)}`,
      meta: { lecture: isLecture || isVideo, courseCode: post.courseCode ?? null },
    };
  }

  private buildAssignmentCard(assignment: AssignmentDocument): MessageCard {
    return {
      kind: 'assignment',
      refId: String(assignment._id),
      title: firstLine(assignment.title) || 'واجب',
      subtitle: assignment.courseCode ? `واجب · ${assignment.courseCode}` : 'واجب',
      imageUrl: null,
      href: '/study/assignments',
      meta: { dueAt: assignment.dueDate ? new Date(assignment.dueDate).toISOString() : null },
    };
  }

  private buildEventCard(event: EventDocument): MessageCard {
    return {
      kind: 'event',
      refId: String(event._id),
      title: firstLine(event.title) || 'فعالية',
      subtitle: firstLine(event.location || event.organizer) || 'فعالية',
      imageUrl: null,
      href: '/events',
      meta: {
        startsAt: new Date(event.startsAt).toISOString(),
        location: event.location || null,
        attendees: event.attendees?.length ?? 0,
      },
    };
  }

  private buildListingCard(listing: ListingDocument): MessageCard {
    return {
      kind: 'listing',
      refId: String(listing._id),
      title: firstLine(listing.title) || 'إعلان',
      subtitle: `${listing.price} ج.م`,
      imageUrl: listing.images?.[0] ?? null,
      href: '/marketplace',
      meta: { price: listing.price, status: listing.status },
    };
  }

  // --- access ---

  private async viewer(userId: string): Promise<Viewer> {
    const user = await this.usersService.findById(userId);
    return {
      id: userId,
      role: user.role,
      department: user.department ?? null,
      academicYear: user.academicYear ?? null,
    };
  }

  private isStaff(viewer: Viewer): boolean {
    return viewer.role === Role.PROFESSOR || viewer.role === Role.ADMIN;
  }

  // The شعبة wall: a student can share their own شعبة's items or college-wide (department null) ones.
  private assertDepartment(viewer: Viewer, department: string | null | undefined): void {
    if (!department || this.isStaff(viewer) || viewer.department === department) return;
    throw new ForbiddenException('هذا العنصر غير متاح لشعبتك');
  }
}
