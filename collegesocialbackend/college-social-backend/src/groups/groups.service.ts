import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { StudyGroup, StudyGroupDocument } from './schemas/study-group.schema';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { ChannelMessage, ChannelMessageDocument } from './schemas/channel-message.schema';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_CHANNEL_NAME = 'عام';
const INVITE_CODE_ATTEMPTS = 5;

export interface PaginatedGroups {
  data: StudyGroupDocument[];
  total: number;
  page: number;
  limit: number;
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

  async saveChannelMessage(
    channelId: string,
    senderId: string,
    text: string,
    attachmentUrl?: string,
  ): Promise<ChannelMessageDocument> {
    const channel = await this.assertChannelMember(channelId, senderId);
    const message = await new this.channelMessageModel({
      channel: new Types.ObjectId(channelId),
      sender: new Types.ObjectId(senderId),
      text: text ?? '',
      attachmentUrl: attachmentUrl ?? null,
    }).save();

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
          preview: text?.slice(0, 120) ?? (attachmentUrl ? 'أرسل مرفقًا' : ''),
        });
      }
    }

    return message.populate('sender', 'name role photoUrl collegeId');
  }

  async getChannelMessages(channelId: string, userId: string, page = 1, limit = 30): Promise<ChannelMessageDocument[]> {
    await this.assertChannelMember(channelId, userId);
    return this.channelMessageModel
      .find({ channel: new Types.ObjectId(channelId) })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'name role photoUrl collegeId')
      .exec();
  }

  // Every channel ID across every group the user belongs to -- used once at socket connect to
  // auto-join rooms, mirroring ChatGateway's existing conversation auto-join.
  async listMyChannelIds(userId: string): Promise<string[]> {
    const groups = await this.groupModel.find({ members: new Types.ObjectId(userId) }).select('_id').exec();
    const channels = await this.channelModel
      .find({ group: { $in: groups.map((g) => g._id) } })
      .select('_id')
      .exec();
    return channels.map((c) => c._id.toString());
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
    const channels = await this.channelModel.find({ group: group._id }).select('_id').exec();
    await this.channelMessageModel.deleteMany({ channel: { $in: channels.map((c) => c._id) } }).exec();
    await this.channelModel.deleteMany({ group: group._id }).exec();
    await this.groupModel.findByIdAndDelete(id).exec();
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
