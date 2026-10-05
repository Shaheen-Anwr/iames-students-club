import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { ChatService } from './chat.service';
import { VoiceRoom, VoiceRoomDocument } from './schemas/voice-room.schema';

export const MAX_VOICE_PARTICIPANTS = 8;
export const VOICE_LEASE_MS = 60_000;

@Injectable()
export class ChatVoiceRoomsService {
  constructor(
    @InjectModel(VoiceRoom.name) private readonly rooms: Model<VoiceRoomDocument>,
    private readonly chat: ChatService,
    private readonly users: UsersService,
  ) {}

  private async assertGroup(userId: string, conversationId: string) {
    if (!userId) throw new ForbiddenException('سجّل الدخول أولًا');
    const conversation = await this.chat.assertParticipant(conversationId, userId);
    if (!conversation.isGroup) throw new BadRequestException('الغرف الصوتية متاحة داخل المجموعات فقط');
    return conversation;
  }

  private async prune(conversationId: string) {
    await this.rooms.updateOne({ conversation: new Types.ObjectId(conversationId) }, {
      $pull: { participants: { lastSeen: { $lt: new Date(Date.now() - VOICE_LEASE_MS) } } },
    });
  }

  async state(userId: string, conversationId: string) {
    const group = await this.assertGroup(userId, conversationId);
    await this.prune(conversationId);
    // Membership changes also remove the corresponding voice seat. Signalling independently
    // rechecks membership so a removed member cannot relay SDP while awaiting this cleanup.
    await this.rooms.updateOne({ conversation: new Types.ObjectId(conversationId) }, {
      $pull: { participants: { userId: { $nin: group.participants.map(String) } } },
    });
    return this.snapshot(conversationId);
  }

  async snapshot(conversationId: string) {
    const room = await this.rooms.findOne({ conversation: new Types.ObjectId(conversationId) }).lean().exec();
    return {
      conversationId, capacity: MAX_VOICE_PARTICIPANTS,
      participants: (room?.participants ?? []).filter((p) => p.lastSeen.getTime() >= Date.now() - VOICE_LEASE_MS)
        .map(({ lastSeen: _lastSeen, ...participant }) => participant),
    };
  }

  async join(userId: string, socketId: string, conversationId: string, muted: boolean) {
    await this.assertGroup(userId, conversationId);
    await this.prune(conversationId);
    const conversation = new Types.ObjectId(conversationId);
    const existing = await this.rooms.findOne({ conversation }).lean().exec();
    if (existing?.participants.some((p) => p.socketId === socketId && p.userId === userId)) {
      await this.heartbeat(userId, socketId, conversationId);
      return this.snapshot(conversationId);
    }
    for (const participant of existing?.participants ?? []) {
      if (await this.users.areBlocked(userId, participant.userId)) {
        throw new ForbiddenException('لا يمكنك الانضمام لهذه الغرفة');
      }
    }
    const user = await this.users.findById(userId);
    try {
      await this.rooms.updateOne({ conversation }, { $setOnInsert: { conversation, participants: [] } }, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    // A single conditional update reserves the seat across all application instances. Never
    // perform a count-then-push: two simultaneous joins must not create a ninth participant.
    const room = await this.rooms.findOneAndUpdate({
      conversation,
      'participants.userId': { $ne: userId },
      $expr: { $lt: [{ $size: '$participants' }, MAX_VOICE_PARTICIPANTS] },
    }, {
      $push: { participants: { userId, socketId, name: user.name, photoUrl: user.photoUrl ?? null, muted, lastSeen: new Date() } },
    }, { new: true }).exec();
    if (!room) throw new BadRequestException('الغرفة ممتلئة أو انضممت إليها من جهاز آخر');
    return this.snapshot(conversationId);
  }

  async heartbeat(userId: string, socketId: string, conversationId: string) {
    await this.assertGroup(userId, conversationId);
    const result = await this.rooms.updateOne({
      conversation: new Types.ObjectId(conversationId),
      participants: { $elemMatch: { userId, socketId, lastSeen: { $gte: new Date(Date.now() - VOICE_LEASE_MS) } } },
    }, { $set: { 'participants.$.lastSeen': new Date() } });
    if (!result.matchedCount) throw new ForbiddenException('انتهت جلسة الغرفة، انضم مجددًا');
    return { ok: true };
  }

  async mute(userId: string, socketId: string, conversationId: string, muted: boolean) {
    await this.heartbeat(userId, socketId, conversationId);
    await this.rooms.updateOne({
      conversation: new Types.ObjectId(conversationId), participants: { $elemMatch: { userId, socketId } },
    }, { $set: { 'participants.$.muted': muted } });
    return this.snapshot(conversationId);
  }

  async leaveSocket(socketId: string, conversationId?: string): Promise<string[]> {
    const filter = {
      'participants.socketId': socketId,
      ...(conversationId && Types.ObjectId.isValid(conversationId) ? { conversation: new Types.ObjectId(conversationId) } : {}),
    };
    const rooms = await this.rooms.find(filter).select('conversation').lean().exec();
    await this.rooms.updateMany(filter, { $pull: { participants: { socketId } } });
    return rooms.map((room) => room.conversation.toString());
  }

  async relayTarget(userId: string, socketId: string, conversationId: string, targetSocketId: string) {
    await this.assertGroup(userId, conversationId);
    const room = await this.snapshot(conversationId);
    const sender = room.participants.find((p) => p.socketId === socketId && p.userId === userId);
    const target = room.participants.find((p) => p.socketId === targetSocketId);
    if (!sender || !target || targetSocketId === socketId) throw new ForbiddenException('جلسة الغرفة غير صالحة');
    await this.assertGroup(target.userId, conversationId);
    if (await this.users.areBlocked(userId, target.userId)) throw new ForbiddenException('لا يمكنك الاتصال بهذا المستخدم');
    return target.socketId;
  }
}
