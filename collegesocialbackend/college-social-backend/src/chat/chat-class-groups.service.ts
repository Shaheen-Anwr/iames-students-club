import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ChatService } from './chat.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { AppEventsService, type AppEvents } from '../realtime/app-events.service';
import { Role } from '../common/enums/role.enum';
import { classGroupName, classKeyFor, escapeRegex, parseClassKey } from './chat.constants';

// Re-checking a user's class group on every chat-list load is wasted writes; once ensured, skip it
// for this long unless their شعبة/year changed.
const ENSURE_TTL_MS = 10 * 60 * 1000;

const CLASS_GROUP_DESCRIPTION =
  'المجموعة الرسمية لدفعتك — تنضم إليها تلقائيًا، وتصلها المحاضرات الجديدة والإعلانات وسؤال اليوم.';

function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// Class groups ("دفعة"): one group chat per شعبة + academic year that every student in it belongs
// to automatically -- the WhatsApp class group, built in. Membership is reconciled lazily on the
// student's chat-list load (so it also follows a شعبة/year change), and the platform posts into
// the groups itself: a new lecture for that year, a new announcement for that شعبة.
@Injectable()
export class ChatClassGroupsService implements OnModuleInit {
  private readonly logger = new Logger(ChatClassGroupsService.name);
  private readonly ensured = new Map<string, { key: string | null; at: number }>();

  constructor(
    @InjectModel(Conversation.name) private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly chatService: ChatService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly appEvents: AppEventsService,
  ) {}

  onModuleInit() {
    this.appEvents.on('announcement.created', (e) => this.postAnnouncement(e));
    this.appEvents.on('lecture.posted', (e) => this.postLecture(e));
  }

  /** Puts a student in their class group (and out of any old one). Non-students belong to none. */
  async ensureMembership(userId: string): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('role department academicYear')
      .lean<{ role: string; department: string | null; academicYear: string | null } | null>()
      .exec();
    if (!user) return;
    const key = user.role === Role.STUDENT ? classKeyFor(user.department, user.academicYear) : null;
    const cached = this.ensured.get(userId);
    if (cached && cached.key === key && Date.now() - cached.at < ENSURE_TTL_MS) return;

    const uid = new Types.ObjectId(userId);
    // Changed شعبة/year (or no longer a student): leave the old class group(s).
    const oldFilter = { classKey: key ? { $type: 'string', $ne: key } : { $type: 'string' }, participants: uid };
    const previous = await this.conversationModel.find(oldFilter).select('_id').lean<{ _id: Types.ObjectId }[]>().exec();
    await this.conversationModel
      .updateMany(
        oldFilter,
        { $pull: { participants: uid } },
      )
      .exec();
    for (const group of previous) this.realtimeEmitter.leaveUserConversation(userId, String(group._id));

    if (key) await this.join(uid, key);
    this.ensured.set(userId, { key, at: Date.now() });
  }

  // Find-or-create the class group and add the student, in one upsert. `new: false` hands back the
  // pre-update document (null when this call created it), which tells us whether they're new here.
  private async join(uid: Types.ObjectId, key: string): Promise<void> {
    const parsed = parseClassKey(key);
    if (!parsed) return;
    const filter = { classKey: key };
    const update = {
      $setOnInsert: {
        classKey: key,
        isGroup: true,
        visibility: 'private',
        name: classGroupName(parsed.department, parsed.academicYear),
        groupDescription: CLASS_GROUP_DESCRIPTION,
        admins: [],
        createdBy: null,
      },
      $addToSet: { participants: uid },
      $pull: { deletedBy: uid },
    };
    let before: ConversationDocument | null;
    try {
      before = await this.conversationModel.findOneAndUpdate(filter, update, { upsert: true, new: false }).exec();
    } catch (err) {
      // Two students of a brand-new class raced to create it -- the unique index kept one.
      if ((err as { code?: number })?.code !== 11000) throw err;
      before = await this.conversationModel.findOneAndUpdate(filter, update, { new: false }).exec();
    }
    const wasMember = !!before?.participants.some((p) => p.equals(uid));
    if (wasMember) return;
    const conversation = before ?? (await this.conversationModel.findOne(filter).select('_id').exec());
    if (conversation) this.realtimeEmitter.joinUserToConversation(uid.toString(), String(conversation._id));
  }

  /** Every class group, for the daily question / evening catch-up jobs. */
  async listAll(): Promise<{ _id: Types.ObjectId; classKey: string; participants: Types.ObjectId[] }[]> {
    return this.conversationModel
      .find({ classKey: { $type: 'string' } })
      .select('_id classKey participants')
      .lean<{ _id: Types.ObjectId; classKey: string; participants: Types.ObjectId[] }[]>()
      .exec();
  }

  // --- the platform's own posts ---

  private async postAnnouncement(e: AppEvents['announcement.created']): Promise<void> {
    const filter = e.department
      ? { classKey: { $regex: `^${escapeRegex(e.department)}:` } }
      : { classKey: { $type: 'string' } };
    const groups = await this.conversationModel.find(filter).select('_id').lean<{ _id: Types.ObjectId }[]>().exec();
    for (const group of groups) {
      await this.chatService
        .saveBotMessage(String(group._id), 'system', {
          card: {
            kind: 'announcement',
            refId: e.id,
            title: excerpt(e.title, 90) || 'إعلان جديد',
            subtitle: excerpt(e.body),
            imageUrl: null,
            href: '/announcements',
            meta: null,
          },
        })
        .catch((err) => this.logger.warn(`Announcement post to class group failed: ${(err as Error).message}`));
    }
  }

  private async postLecture(e: AppEvents['lecture.posted']): Promise<void> {
    // A lecture tagged for a specific year only -- an untagged one would spam every year's group.
    const key = classKeyFor(e.department, e.academicYear);
    if (!key) return;
    const group = await this.conversationModel.findOne({ classKey: key }).select('_id').lean<{ _id: Types.ObjectId } | null>().exec();
    if (!group) return;
    await this.chatService.saveBotMessage(String(group._id), 'system', {
      card: {
        kind: 'post',
        refId: e.id,
        title: excerpt(e.title, 90) || 'محاضرة جديدة',
        subtitle: e.courseCode ? `محاضرة جديدة · ${e.courseCode}` : 'محاضرة جديدة',
        imageUrl: null,
        href: `/posts/${e.id}`,
        meta: { lecture: true, courseCode: e.courseCode },
      },
    });
  }
}
