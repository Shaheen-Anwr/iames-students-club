import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { GroupVisibility, StudyGroup, StudyGroupDocument } from './schemas/study-group.schema';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { ChannelMessage, ChannelMessageDocument } from './schemas/channel-message.schema';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { AttachmentDto } from '../chat/dto/create-message.dto';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_CHANNEL_NAME = 'عام';
const INVITE_CODE_ATTEMPTS = 5;

// Mirrors MESSAGE_POPULATE in chat.service.ts so a channel message carries the same
// shape the shared chat components already know how to render.
const CHANNEL_MESSAGE_POPULATE = [
  { path: 'sender', select: 'name role photoUrl collegeId' },
  { path: 'reactions.user', select: 'name' },
  {
    path: 'replyTo',
    select: 'text sender attachments attachmentUrl deletedForEveryone',
    populate: { path: 'sender', select: 'name' },
  },
];

const ATTACHMENT_PREVIEW_LABELS: Record<string, string> = {
  image: 'صورة 📷',
  video: 'فيديو 🎥',
  audio: 'ملف صوتي 🎵',
  voice: 'رسالة صوتية 🎤',
  document: 'مستند 📄',
};

export interface PaginatedGroups {
  data: StudyGroupDocument[];
  total: number;
  page: number;
  limit: number;
}

// One row in the unified "المجموعات" explorer -- every group in the app, each annotated with
// the caller's relationship to it. Deliberately omits `inviteCode` and the raw member id list
// so private groups the caller hasn't joined leak nothing beyond their name/size.
export interface GroupListItem {
  _id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  owner: string;
  visibility: GroupVisibility;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  createdAt: string;
}

export interface GroupStats {
  totalGroups: number;
  publicGroups: number;
  privateGroups: number;
  totalChannels: number;
  totalMessages: number;
  avgMembersPerGroup: number;
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(StudyGroup.name) private groupModel: Model<StudyGroupDocument>,
    @InjectModel(Channel.name) private channelModel: Model<ChannelDocument>,
    @InjectModel(ChannelMessage.name) private channelMessageModel: Model<ChannelMessageDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(ownerId: string, dto: CreateGroupDto): Promise<StudyGroupDocument> {
    const owner = new Types.ObjectId(ownerId);
    const visibility = dto.visibility ?? 'private';
    let group: StudyGroupDocument | null = null;

    if (visibility === 'public') {
      group = await new this.groupModel({
        name: dto.name,
        description: dto.description ?? null,
        owner,
        members: [owner],
        visibility,
        inviteCode: null,
      }).save();
    } else {
      for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS && !group; attempt += 1) {
        const inviteCode = crypto.randomBytes(6).toString('base64url');
        try {
          group = await new this.groupModel({
            name: dto.name,
            description: dto.description ?? null,
            owner,
            members: [owner],
            visibility,
            inviteCode,
          }).save();
        } catch (err) {
          // E11000 duplicate key on inviteCode -- vanishingly rare, just retry with a fresh code.
          if ((err as { code?: number }).code !== 11000) throw err;
        }
      }
      if (!group) throw new Error('تعذّر إنشاء رمز دعوة فريد، حاول مرة أخرى');
    }

    await new this.channelModel({ group: group._id, name: DEFAULT_CHANNEL_NAME }).save();
    return group;
  }

  // Publicly listed groups, newest first, optionally filtered by a case-insensitive name search.
  async discover(search: string | undefined, page = 1, limit = 20): Promise<StudyGroupDocument[]> {
    const filter: Record<string, unknown> = { visibility: 'public' };
    if (search) filter.name = { $regex: search, $options: 'i' };
    return this.groupModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  // Every group in the app, newest first, for the unified explorer list. Private groups the
  // caller hasn't joined are still returned (name + size only) -- joining them still needs a code.
  async listAll(userId: string, search?: string): Promise<GroupListItem[]> {
    const filter: Record<string, unknown> = {};
    if (search?.trim()) filter.name = { $regex: search.trim(), $options: 'i' };
    const groups = await this.groupModel.find(filter).lean().exec();
    const items: GroupListItem[] = [];
    for (const g of groups) {
      try {
        const id = new Types.ObjectId(g._id);
        const members = Array.isArray(g.members) ? g.members : [];
        const owner = g.owner ? g.owner.toString() : '';
        const rawCreated = (g as unknown as { createdAt?: unknown }).createdAt;
        const created =
          rawCreated instanceof Date
            ? rawCreated
            : typeof rawCreated === 'string' || typeof rawCreated === 'number'
              ? new Date(rawCreated)
              : id.getTimestamp();
        items.push({
          _id: id.toString(),
          name: g.name ?? '',
          description: g.description ?? null,
          photoUrl: g.photoUrl ?? null,
          owner,
          visibility: g.visibility === 'public' ? 'public' : 'private',
          memberCount: members.length,
          isMember: members.some((m) => m?.toString() === userId),
          isOwner: owner !== '' && owner === userId,
          createdAt: (isNaN(created.getTime()) ? id.getTimestamp() : created).toISOString(),
        });
      } catch {
        // Skip a single malformed document rather than 500 the whole list.
      }
    }
    // Newest first.
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async joinPublic(groupId: string, userId: string): Promise<StudyGroupDocument> {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    if (group.visibility !== 'public') throw new ForbiddenException('هذه المجموعة خاصة، يلزم رمز دعوة للانضمام');
    await this.groupModel.findByIdAndUpdate(groupId, { $addToSet: { members: new Types.ObjectId(userId) } }).exec();
    return this.groupModel.findById(groupId).exec() as Promise<StudyGroupDocument>;
  }

  async listMine(userId: string): Promise<StudyGroupDocument[]> {
    return this.groupModel
      .find({ members: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async findOne(id: string, userId: string): Promise<StudyGroupDocument> {
    const group = await this.assertMember(id, userId);
    return group;
  }

  async joinByCode(userId: string, code: string): Promise<StudyGroupDocument> {
    const group = await this.groupModel.findOne({ inviteCode: code }).exec();
    if (!group) throw new NotFoundException('رمز الدعوة غير صالح');
    await this.groupModel.findByIdAndUpdate(group._id, { $addToSet: { members: new Types.ObjectId(userId) } }).exec();
    return this.groupModel.findById(group._id).exec() as Promise<StudyGroupDocument>;
  }

  async leave(id: string, userId: string): Promise<void> {
    await this.assertMember(id, userId);
    await this.groupModel.findByIdAndUpdate(id, { $pull: { members: new Types.ObjectId(userId) } }).exec();
  }

  async regenerateInviteCode(id: string, requesterId: string): Promise<StudyGroupDocument> {
    const group = await this.assertOwner(id, requesterId);
    if (group.visibility !== 'private') {
      throw new ForbiddenException('المجموعات العامة لا تملك رمز دعوة');
    }
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
      const inviteCode = crypto.randomBytes(6).toString('base64url');
      try {
        group.inviteCode = inviteCode;
        return await group.save();
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new Error('تعذّر إنشاء رمز دعوة فريد، حاول مرة أخرى');
  }

  // Owner-only edit of name / description / visibility. Flipping public->private mints a fresh
  // unique inviteCode; private->public drops it.
  async update(id: string, userId: string, dto: UpdateGroupDto): Promise<StudyGroupDocument> {
    const group = await this.assertOwner(id, userId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('اسم المجموعة مطلوب');
      group.name = name;
    }
    if (dto.description !== undefined) {
      group.description = dto.description.trim() || null;
    }

    if (dto.visibility !== undefined && dto.visibility !== group.visibility) {
      group.visibility = dto.visibility;
      if (dto.visibility === 'public') {
        group.inviteCode = null;
        return group.save();
      }
      // Now private -- needs a unique code. Same retry-on-collision pattern as create().
      for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
        group.inviteCode = crypto.randomBytes(6).toString('base64url');
        try {
          return await group.save();
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err;
        }
      }
      throw new Error('تعذّر إنشاء رمز دعوة فريد، حاول مرة أخرى');
    }

    return group.save();
  }

  // Owner-only. Permanently removes the group and cascades to its channels + channel messages.
  async remove(id: string, userId: string): Promise<void> {
    const group = await this.assertOwner(id, userId);
    await this.cascadeDeleteGroup(group._id);
  }

  async setPhoto(id: string, userId: string, url: string): Promise<StudyGroupDocument> {
    const group = await this.assertOwner(id, userId);
    group.photoUrl = url;
    return group.save();
  }

  async removePhoto(id: string, userId: string): Promise<StudyGroupDocument> {
    const group = await this.assertOwner(id, userId);
    group.photoUrl = null;
    return group.save();
  }

  private async cascadeDeleteGroup(groupId: Types.ObjectId): Promise<void> {
    const channels = await this.channelModel.find({ group: groupId }).select('_id').exec();
    await this.channelMessageModel.deleteMany({ channel: { $in: channels.map((c) => c._id) } }).exec();
    await this.channelModel.deleteMany({ group: groupId }).exec();
    await this.groupModel.findByIdAndDelete(groupId).exec();
  }

  async listChannels(groupId: string, userId: string): Promise<ChannelDocument[]> {
    await this.assertMember(groupId, userId);
    return this.channelModel.find({ group: new Types.ObjectId(groupId) }).sort({ createdAt: 1 }).exec();
  }

  async createChannel(groupId: string, requesterId: string, dto: CreateChannelDto): Promise<ChannelDocument> {
    await this.assertOwner(groupId, requesterId);
    return new this.channelModel({ group: new Types.ObjectId(groupId), name: dto.name }).save();
  }

  async assertMember(groupId: string, userId: string): Promise<StudyGroupDocument> {
    const group = await this.groupModel.findById(groupId).exec();
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    const isMember = group.members.some((m) => m.toString() === userId);
    if (!isMember) throw new ForbiddenException('أنت لست عضوًا في هذه المجموعة');
    return group;
  }

  async assertOwner(groupId: string, userId: string): Promise<StudyGroupDocument> {
    const group = await this.assertMember(groupId, userId);
    if (group.owner.toString() !== userId) {
      throw new ForbiddenException('هذا الإجراء متاح لمالك المجموعة فقط');
    }
    return group;
  }

  async assertChannelMember(channelId: string, userId: string): Promise<ChannelDocument> {
    const channel = await this.channelModel.findById(channelId).exec();
    if (!channel) throw new NotFoundException('القناة غير موجودة');
    await this.assertMember(channel.group.toString(), userId);
    return channel;
  }

  private attachmentPreview(attachments?: AttachmentDto[]): string {
    if (!attachments?.length) return 'أرسل مرفقًا';
    return ATTACHMENT_PREVIEW_LABELS[attachments[0].type] ?? 'أرسل مرفقًا';
  }

  async saveChannelMessage(
    channelId: string,
    senderId: string,
    text: string,
    attachments?: AttachmentDto[],
    replyTo?: string,
    attachmentUrl?: string,
  ): Promise<ChannelMessageDocument> {
    const channel = await this.assertChannelMember(channelId, senderId);
    const message = await new this.channelMessageModel({
      channel: new Types.ObjectId(channelId),
      sender: new Types.ObjectId(senderId),
      text: text ?? '',
      attachments: attachments ?? [],
      attachmentUrl: attachmentUrl ?? null,
      replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
    }).save();

    const hasAttachment = !!attachments?.length || !!attachmentUrl;
    const preview = text?.slice(0, 120) || (hasAttachment ? this.attachmentPreview(attachments) : '');

    const group = await this.groupModel.findById(channel.group).select('members').exec();
    if (group) {
      for (const memberId of group.members) {
        const recipientId = memberId.toString();
        if (recipientId === senderId) continue;
        await this.notificationsService.create({
          recipient: recipientId,
          actor: senderId,
          type: 'channel_message',
          groupId: channel.group.toString(),
          channelId,
          preview,
        });
      }
    }

    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  private async getOwnChannelMessage(messageId: string, userId: string): Promise<ChannelMessageDocument> {
    const message = await this.channelMessageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    if (message.sender.toString() !== userId) throw new ForbiddenException('لا يمكنك تعديل رسالة مستخدم آخر');
    return message;
  }

  // Any channel-member can act on a message they can see (react/star); edit/delete-for-everyone
  // stay sender-only via getOwnChannelMessage.
  private async assertMessageVisible(messageId: string, userId: string): Promise<ChannelMessageDocument> {
    const message = await this.channelMessageModel.findById(messageId).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    await this.assertChannelMember(message.channel.toString(), userId);
    return message;
  }

  async editChannelMessage(messageId: string, userId: string, text: string): Promise<ChannelMessageDocument> {
    const message = await this.getOwnChannelMessage(messageId, userId);
    if (message.deletedForEveryone) throw new BadRequestException('تم حذف هذه الرسالة');
    message.text = text;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();
    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  async deleteChannelMessage(
    messageId: string,
    userId: string,
    forEveryone: boolean,
  ): Promise<ChannelMessageDocument> {
    const message = await this.assertMessageVisible(messageId, userId);
    if (forEveryone) {
      if (message.sender.toString() !== userId) {
        throw new ForbiddenException('لا يمكنك حذف رسالة مستخدم آخر لدى الجميع');
      }
      message.deletedForEveryone = true;
      message.text = '';
      message.attachments = [];
      message.attachmentUrl = null;
      message.reactions = [];
    } else {
      const uid = new Types.ObjectId(userId);
      if (!message.deletedFor.some((d) => d.toString() === userId)) message.deletedFor.push(uid);
    }
    await message.save();
    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  async reactToChannelMessage(messageId: string, userId: string, emoji: string): Promise<ChannelMessageDocument> {
    const message = await this.assertMessageVisible(messageId, userId);
    const existingIndex = message.reactions.findIndex((r) => r.user.toString() === userId);
    if (existingIndex >= 0 && message.reactions[existingIndex].emoji === emoji) {
      message.reactions.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      message.reactions[existingIndex].emoji = emoji;
    } else {
      message.reactions.push({ user: new Types.ObjectId(userId), emoji });
    }
    await message.save();
    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  async starChannelMessage(messageId: string, userId: string): Promise<ChannelMessageDocument> {
    const message = await this.assertMessageVisible(messageId, userId);
    const uid = new Types.ObjectId(userId);
    if (!message.starredBy.some((s) => s.toString() === userId)) message.starredBy.push(uid);
    await message.save();
    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  async unstarChannelMessage(messageId: string, userId: string): Promise<ChannelMessageDocument> {
    const message = await this.assertMessageVisible(messageId, userId);
    message.starredBy = message.starredBy.filter((s) => s.toString() !== userId) as unknown as Types.ObjectId[];
    await message.save();
    return message.populate(CHANNEL_MESSAGE_POPULATE);
  }

  async getChannelMessages(channelId: string, userId: string, page = 1, limit = 30): Promise<ChannelMessageDocument[]> {
    await this.assertChannelMember(channelId, userId);
    return this.channelMessageModel
      .find({
        channel: new Types.ObjectId(channelId),
        deletedFor: { $ne: new Types.ObjectId(userId) },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(CHANNEL_MESSAGE_POPULATE)
      .exec();
  }

  async listGroupMembers(groupId: string, userId: string) {
    const group = await this.assertMember(groupId, userId);
    const populated = await group.populate<{ members: unknown[] }>({
      path: 'members',
      select: 'name role photoUrl collegeId isOnline lastSeenAt',
    });
    return { owner: group.owner.toString(), members: populated.members };
  }

  // Port of ChatService.getSharedMedia -- scans the most recent 500 visible channel messages
  // for images/videos, document attachments and bare URLs in the text.
  async getChannelSharedMedia(channelId: string, userId: string) {
    await this.assertChannelMember(channelId, userId);
    const messages = await this.channelMessageModel
      .find({
        channel: new Types.ObjectId(channelId),
        deletedFor: { $ne: new Types.ObjectId(userId) },
        deletedForEveryone: false,
      })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('attachments attachmentUrl text createdAt')
      .lean<
        {
          _id: Types.ObjectId;
          attachments?: { url: string; type: string; name: string | null; size: number | null }[];
          attachmentUrl?: string | null;
          text?: string;
          createdAt: Date;
        }[]
      >()
      .exec();

    const media: { _id: string; url: string; type: string; createdAt: Date }[] = [];
    const files: { _id: string; url: string; type: string; name: string | null; size: number | null; createdAt: Date }[] = [];
    const links: { messageId: string; url: string; createdAt: Date }[] = [];
    const urlRegex = /https?:\/\/[^\s<>()]+/gi;
    const imageExt = /\.(png|jpe?g|gif|webp)$/i;

    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.type === 'image' || attachment.type === 'video') {
          media.push({ _id: `${message._id}`, url: attachment.url, type: attachment.type, createdAt: message.createdAt });
        } else if (attachment.type === 'document') {
          files.push({
            _id: `${message._id}`,
            url: attachment.url,
            type: attachment.type,
            name: attachment.name,
            size: attachment.size,
            createdAt: message.createdAt,
          });
        }
      }
      if (message.attachmentUrl) {
        const legacyType = imageExt.test(message.attachmentUrl) ? 'image' : 'document';
        if (legacyType === 'image') {
          media.push({ _id: `${message._id}`, url: message.attachmentUrl, type: 'image', createdAt: message.createdAt });
        } else {
          files.push({
            _id: `${message._id}`,
            url: message.attachmentUrl,
            type: 'document',
            name: null,
            size: null,
            createdAt: message.createdAt,
          });
        }
      }
      for (const match of message.text?.matchAll(urlRegex) ?? []) {
        links.push({ messageId: `${message._id}`, url: match[0], createdAt: message.createdAt });
      }
    }

    return { media, files, links };
  }

  // Every channel ID across every group the user belongs to -- used once at socket connect to
  // auto-join rooms, mirroring ChatGateway's existing conversation auto-join.
  async listMyChannelIds(userId: string): Promise<string[]> {
    const groups = await this.groupModel
      .find({ members: new Types.ObjectId(userId) })
      .select('_id')
      .lean()
      .exec();
    const channels = await this.channelModel
      .find({ group: { $in: groups.map((g) => g._id) } })
      .select('_id')
      .lean()
      .exec();
    return channels.map((c) => (c._id as Types.ObjectId).toString());
  }

  // --- Admin-only operations (guarded at the controller level) ---

  async adminListGroups(page = 1, limit = 20, search?: string): Promise<PaginatedGroups> {
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const [data, total] = await Promise.all([
      this.groupModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('owner', 'name role photoUrl collegeId')
        .exec(),
      this.groupModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, limit };
  }

  // Unlike leave()/remove elsewhere, an admin can delete any group regardless of ownership --
  // cascades to its channels and channel messages the same way a real deletion should.
  async adminRemoveGroup(id: string): Promise<void> {
    const group = await this.groupModel.findById(id).exec();
    if (!group) throw new NotFoundException('المجموعة غير موجودة');
    await this.cascadeDeleteGroup(group._id);
  }

  async adminRemoveChannelMessage(id: string): Promise<void> {
    const message = await this.channelMessageModel.findByIdAndDelete(id).exec();
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
  }

  async getStats(): Promise<GroupStats> {
    const [totalGroups, publicGroups, totalChannels, totalMessages, memberAgg] = await Promise.all([
      this.groupModel.countDocuments().exec(),
      this.groupModel.countDocuments({ visibility: 'public' }).exec(),
      this.channelModel.countDocuments().exec(),
      this.channelMessageModel.countDocuments().exec(),
      this.groupModel
        .aggregate<{ avgMembers: number }>([
          { $project: { count: { $size: '$members' } } },
          { $group: { _id: null, avgMembers: { $avg: '$count' } } },
        ])
        .exec(),
    ]);
    return {
      totalGroups,
      publicGroups,
      privateGroups: totalGroups - publicGroups,
      totalChannels,
      totalMessages,
      avgMembersPerGroup: Math.round((memberAgg[0]?.avgMembers ?? 0) * 10) / 10,
    };
  }
}
