import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';
import { isCallId, isCallOutcome, isMissedCallOutcome } from './chat.constants';
import type { MessageDocument } from './schemas/message.schema';

export interface CallPeerInfo {
  userId: string;
  name: string;
  photoUrl: string | null;
}

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CallLogInput {
  callId: string;
  conversationId: string;
  callType: string;
  outcome: string;
  duration?: number;
}

const splitList = (value?: string | null) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// The server side of 1-to-1 WebRTC calls. Media never touches the server: ChatGateway only relays
// signaling. This service holds the parts that need trust or configuration -- who may call whom,
// the ICE (STUN/TURN) servers a client should use, and writing the call record into the chat.
@Injectable()
export class ChatCallService {
  constructor(
    private readonly chat: ChatService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  // STUN for direct connections + TURN (when configured) to relay through NATs that block them.
  // With TURN_SECRET set, credentials are minted per user per request in coturn's REST format
  // (username "<expiry>:<userId>", credential = base64 HMAC-SHA1) so nothing long-lived is
  // shipped to browsers.
  getIceServers(userId: string): { iceServers: IceServerConfig[]; ttl: number } {
    const ttl = this.config.get<number>('calls.turnTtlSeconds') ?? 86_400;
    const iceServers: IceServerConfig[] = [];
    const stun = splitList(this.config.get<string>('calls.stunUrls'));
    if (stun.length) iceServers.push({ urls: stun });

    const turn = splitList(this.config.get<string>('calls.turnUrls'));
    if (turn.length) {
      const secret = this.config.get<string>('calls.turnSecret');
      if (secret) {
        const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
        const credential = createHmac('sha1', secret).update(username).digest('base64');
        iceServers.push({ urls: turn, username, credential });
      } else {
        const username = this.config.get<string>('calls.turnUsername');
        const credential = this.config.get<string>('calls.turnCredential');
        iceServers.push(username && credential ? { urls: turn, username, credential } : { urls: turn });
      }
    }
    return { iceServers, ttl };
  }

  // A call may only be placed inside an existing 1-to-1 conversation between the two users, and
  // never across a block. Returns the caller's public card for the callee's ringing screen (taken
  // from the database, not from the client, so it can't be spoofed).
  async validateCall(callerId: string, conversationId: string, calleeId: string): Promise<CallPeerInfo> {
    if (callerId === calleeId) throw new BadRequestException('لا يمكنك الاتصال بنفسك');
    const conversation = await this.chat.assertParticipant(conversationId, callerId);
    if (conversation.isGroup) throw new BadRequestException('المكالمات الجماعية غير متاحة بعد');
    if (!conversation.participants.some((p) => p.toString() === calleeId)) {
      throw new ForbiddenException('هذا المستخدم ليس طرفًا في المحادثة');
    }
    if (await this.users.areBlocked(callerId, calleeId)) {
      throw new ForbiddenException('لا يمكنك الاتصال بهذا المستخدم');
    }
    const caller = await this.users.findById(callerId);
    return { userId: callerId, name: caller.name, photoUrl: caller.photoUrl ?? null };
  }

  // Writes the call into the conversation as a call-log message from the caller. Idempotent per
  // callId (the client may report twice). Only missed calls notify the other side -- a finished
  // call doesn't need a push.
  async logCall(callerId: string, input: CallLogInput): Promise<{ message: MessageDocument; created: boolean }> {
    if (!isCallId(input?.callId) || !isCallOutcome(input?.outcome)) {
      throw new BadRequestException('سجل مكالمة غير صالح');
    }
    const existing = await this.chat.findCallLog(input.callId);
    if (existing) return { message: existing, created: false };

    const conversation = await this.chat.assertParticipant(input.conversationId, callerId);
    if (conversation.isGroup) throw new BadRequestException('المكالمات الجماعية غير متاحة بعد');

    const outcome = input.outcome;
    const duration =
      outcome === 'completed' ? Math.max(0, Math.min(Math.round(Number(input.duration) || 0), 24 * 3600)) : 0;
    try {
      const message = await this.chat.saveMessage(input.conversationId, callerId, '', undefined, undefined, {
        call: { callId: input.callId, type: input.callType === 'video' ? 'video' : 'audio', outcome, duration },
        silent: !isMissedCallOutcome(outcome),
      });
      return { message, created: true };
    } catch (err) {
      // Lost a race with a concurrent report of the same call (unique index on call.callId).
      if ((err as { code?: number })?.code === 11000) {
        const again = await this.chat.findCallLog(input.callId);
        if (again) return { message: again, created: false };
      }
      throw err;
    }
  }
}
