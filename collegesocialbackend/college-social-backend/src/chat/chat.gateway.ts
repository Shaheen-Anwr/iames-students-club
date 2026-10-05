import { Logger, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { ChatPresenceService } from './chat-presence.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { GroupsService } from '../groups/groups.service';
import { CreateChannelMessageDto } from '../groups/dto/create-channel-message.dto';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import { corsOriginValidator } from '../common/cors-origin';
import { WsHttpExceptionFilter } from './ws-exception.filter';
import { ChatCallService } from './chat-call.service';
import { ChatCardsService } from './chat-cards.service';
import { ChatVoiceRoomsService } from './chat-voice-rooms.service';
import { isCallId } from './chat.constants';
import { Types } from 'mongoose';

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    collegeId: string;
    role: string;
    // Per-socket rate-limit buckets: action name -> recent hit timestamps. See rateLimited().
    rl?: Map<string, number[]>;
  };
}


// Frontend connects with: io(URL, { auth: { token: <JWT access token> } })
// Then joins per-conversation rooms with the "joinConversation" event before sending messages.
// This same socket also carries group-channel traffic (joinChannel/sendChannelMessage/channelTyping)
// and WebRTC call signaling (callUser/answerCall/iceCandidate/endCall/rejectCall).
@WebSocketGateway({
  cors: { origin: corsOriginValidator, credentials: true },
  namespace: '/chat',
  // WebSocket first -- skip the HTTP long-polling handshake + upgrade round-trips for clients
  // that can go straight to WS (all modern browsers). Polling stays as a fallback.
  transports: ['websocket', 'polling'],
  // Heartbeat: detect a dead client within ~pingInterval+pingTimeout without being chatty.
  pingInterval: 25000,
  pingTimeout: 20000,
  // Reject oversized frames early instead of buffering them (message bodies are small; large
  // media goes through the HTTP upload API, never the socket).
  maxHttpBufferSize: 1_000_000,
  // Chat payloads are tiny; per-message deflate just burns CPU under load. Leave it off.
  perMessageDeflate: false,
  // A briefly-dropped client (tunnel, backgrounded tab, flaky mobile) resumes the same session
  // -- rooms and missed events are restored automatically, so it skips re-auth + re-join and
  // doesn't add to the connect-storm DB load. See the `client.recovered` fast path below.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
})
// Service errors (HttpException) reach the client's 'exception' listener with their real message.
@UseFilters(new WsHttpExceptionFilter())
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Live socket-count presence now lives in ChatPresenceService: a per-process Map by default,
  // or a shared Redis hash when REDIS_URL is set so the count is correct across instances behind
  // the Socket.IO Redis adapter.

  // Throttle for the admin "online now" broadcast: coalesce bursts into at most one emit per
  // window, always with a trailing emit so the final value is never missed.
  private static readonly ONLINE_EMIT_WINDOW_MS = 3000;
  private lastOnlineEmitAt = 0;
  private onlineEmitTimer: NodeJS.Timeout | null = null;

  // Deferred "mark offline" writes, keyed by userId. A disconnect schedules the DB write a few
  // seconds out; a reconnect within that grace window cancels it. This collapses reconnect-storm
  // flapping (deploy, wifi blip) from thousands of Mongo writes + presence broadcasts to ~zero.
  private static readonly OFFLINE_GRACE_MS = 8000;
  private readonly pendingOffline = new Map<string, NodeJS.Timeout>();
  private readonly joiningVoice = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly groupsService: GroupsService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly usersService: UsersService,
    private readonly presence: ChatPresenceService,
    private readonly callService: ChatCallService,
    private readonly cardsService: ChatCardsService,
    private readonly voiceRooms: ChatVoiceRoomsService,
  ) {}

  // Lets HTTP-only services (e.g. PostsService, over comments/reactions) push notifications
  // through this same socket without depending on ChatModule -- see RealtimeEmitterService.
  afterInit(server: Server) {
    this.realtimeEmitter.setServer(server);
  }

  // Validates the JWT on the socket handshake; disconnects unauthenticated sockets immediately.
  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.toString().replace('Bearer ', '') ?? '');

      if (!token) throw new Error('Missing token');

      // Async verify -- keeps the event loop free during a reconnect storm.
      const payload = await this.jwtService.verifyAsync(token);
      client.data.userId = payload.sub;
      client.data.collegeId = payload.collegeId;
      client.data.role = payload.role;

      const isFirstSocketForUser = await this.presence.track(payload.sub);
      this.cancelPendingOffline(payload.sub);

      // A recovered session (brief drop within connectionStateRecovery's window) already has its
      // rooms + missed events restored by Socket.IO -- skip every DB round-trip below.
      if (client.recovered) {
        if (isFirstSocketForUser) {
          void this.usersService.setOnline(payload.sub, true).catch(() => undefined);
          void this.usersService.emitPresenceToFriends(payload.sub, true).catch(() => undefined);
        }
        this.scheduleOnlineCountBroadcast();
        return;
      }

      // Auto-join one room per conversation / channel the user belongs to (IDs only -- see
      // listConversationIdsForUser) so messages reach them without an explicit join first. The
      // two lookups run in parallel; joins are applied in a single batched call.
      const [conversationIds, channelIds, publicGroupIds] = await Promise.all([
        this.chatService.listConversationIdsForUser(payload.sub),
        this.groupsService.listMyChannelIds(payload.sub),
        this.chatService.listPublicGroupIds(payload.sub),
      ]);
      // Public groups the user hasn't joined still belong in their live feed. Presence is
      // delivered separately to friends' personal rooms, never to shared conversation rooms.
      const publicOnlyGroupIds = publicGroupIds.filter((id) => !conversationIds.includes(id));
      const rooms = [
        ...conversationIds.map((id) => `conversation:${id}`),
        ...publicOnlyGroupIds.map((id) => `conversation:${id}`),
        ...channelIds.map((id) => `channel:${id}`),
        // Personal room -- lets RealtimeEmitterService reach this user's socket(s) for
        // notifications regardless of which page they're on.
        `user:${payload.sub}`,
      ];
      // Admin dashboard live signal: admins also join a shared room for emitToAdmins().
      if (payload.role === Role.ADMIN) rooms.push('admins');
      client.join(rooms);

      // Presence write is fire-and-forget (a stale flag is harmless; a blocked handshake isn't)
      // and only needed when this is the user's first live socket.
      if (isFirstSocketForUser) {
        void this.usersService.setOnline(payload.sub, true).catch(() => undefined);
        void this.usersService.emitPresenceToFriends(payload.sub, true).catch(() => undefined);
      }
      this.scheduleOnlineCountBroadcast();

      this.logger.log(`Client connected: user=${payload.sub} socket=${client.id}`);
    } catch (err) {
      this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Voice seats belong to a socket, unlike online presence. Close this device's seat even
    // when the user still has another browser tab connected.
    await this.leaveVoiceSocket(client.id).catch((error) => this.logger.warn(`Voice disconnect cleanup failed: ${error.message}`));

    const stillOnlineElsewhere = await this.presence.untrack(userId);
    if (stillOnlineElsewhere) return; // other tabs/devices remain -- nothing to announce

    // Defer the "offline" write + presence broadcast. If the user reconnects within the grace
    // window (the common case during a deploy or wifi blip) handleConnection cancels this and
    // Mongo is never touched -- which is what keeps a mass reconnect from melting the DB.
    const existing = this.pendingOffline.get(userId);
    if (existing) clearTimeout(existing);
    this.pendingOffline.set(
      userId,
      setTimeout(async () => {
        this.pendingOffline.delete(userId);
        if (await this.presence.isOnline(userId)) return; // came back in the meantime
        const lastSeenAt = new Date();
        void this.usersService.setOnline(userId, false, lastSeenAt).catch(() => undefined);
        void this.usersService.emitPresenceToFriends(userId, false, lastSeenAt).catch(() => undefined);
        this.scheduleOnlineCountBroadcast();
      }, ChatGateway.OFFLINE_GRACE_MS),
    );
  }

  // --- presence bookkeeping (socket-count lives in ChatPresenceService) ---

  private cancelPendingOffline(userId: string): void {
    const t = this.pendingOffline.get(userId);
    if (t) {
      clearTimeout(t);
      this.pendingOffline.delete(userId);
    }
  }

  // Admin dashboard "online now" tile. Coalesces connect/disconnect bursts into at most one
  // emit per window (trailing edge). The count comes from ChatPresenceService (memory or Redis).
  private scheduleOnlineCountBroadcast(): void {
    if (this.onlineEmitTimer) return;
    const delay = Math.max(0, ChatGateway.ONLINE_EMIT_WINDOW_MS - (Date.now() - this.lastOnlineEmitAt));
    this.onlineEmitTimer = setTimeout(async () => {
      this.onlineEmitTimer = null;
      this.lastOnlineEmitAt = Date.now();
      const online = await this.presence.distinctCount();
      this.realtimeEmitter.emitToAdmins('admin:presence', { online });
    }, delay);
  }

  // Cheap per-socket sliding-window rate limit. Returns true when the caller is over budget and
  // the event should be dropped -- shields the event loop from a client flooding an event.
  private rateLimited(client: AuthedSocket, action: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const store = (client.data.rl ??= new Map<string, number[]>());
    const hits = (store.get(action) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      store.set(action, hits);
      return true;
    }
    hits.push(now);
    store.set(action, hits);
    return false;
  }

  // NOTE on handler return values: Nest's socket adapter treats a returned object WITH an `event`
  // key as "emit this event back to the sender" (with its `data`). Returning `{ event:
  // 'messageReacted', ... }` therefore sent every sender a second, payload-less 'messageReacted'
  // that crashed the client's real listener. Handlers return plain `{ ok, ... }` acks instead --
  // delivered only to a client that passes an ack callback, ignored otherwise.
  @SubscribeMessage('joinConversation')
  async onJoinConversation(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    await this.chatService.assertCanAccessConversation(conversationId, client.data.userId);
    client.join(`conversation:${conversationId}`);
    return { ok: true, conversationId };
  }

  @SubscribeMessage('sendMessage')
  async onSendMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CreateMessageDto) {
    if (this.rateLimited(client, 'sendMessage', 25, 10_000)) {
      throw new WsException('أنت ترسل الرسائل بسرعة كبيرة. تمهّل قليلاً.');
    }
    // A sticker is an image reference: an uploaded asset or one of the app's built-in packs.
    if (dto.attachments?.some((a) => a.type === 'sticker' && !/^(https?:\/\/|\/uploads\/|sticker:[a-z0-9-]+\/[a-z0-9-]+$)/i.test(a.url))) {
      throw new WsException('ملصق غير صالح');
    }
    // Cards travel by reference only; the snapshot is built (and access-checked) server-side.
    const card = dto.card ? await this.cardsService.resolve(client.data.userId, dto.card.kind, dto.card.refId) : null;
    const message = await this.chatService.saveMessage(
      dto.conversationId,
      client.data.userId,
      dto.text ?? '',
      dto.attachments,
      dto.replyTo,
      { poll: dto.poll, effect: dto.effect, silent: dto.silent, card, threadRoot: dto.threadRoot ?? null },
    );

    // Broadcast to everyone in the room, including the sender (so all their tabs update)
    this.server.to(`conversation:${dto.conversationId}`).emit('newMessage', message);
    return { ok: true, messageId: message.id };
  }

  // Pin / unpin a message for everyone in its conversation (see ChatService.setMessagePinned for
  // who may). The whole, freshly built pin list is broadcast so every client just replaces its own.
  @SubscribeMessage('pinMessage')
  async onPinMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { messageId: string; pin?: boolean }) {
    if (this.rateLimited(client, 'pinMessage', 10, 10_000)) {
      throw new WsException('تمهّل قليلاً قبل تثبيت رسائل أخرى.');
    }
    const pin = dto?.pin !== false;
    const { conversationId, pins } = await this.chatService.setMessagePinned(dto?.messageId, client.data.userId, pin);
    this.server.to(`conversation:${conversationId}`).emit('pinsUpdated', {
      conversationId,
      pins,
      messageId: dto.messageId,
      pinned: pin,
      actorId: client.data.userId,
    });
    return { ok: true, conversationId };
  }

  @SubscribeMessage('votePoll')
  async onVotePoll(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { messageId: string; optionIds: string[] }) {
    if (this.rateLimited(client, 'votePoll', 20, 10_000)) return { ok: false, rateLimited: true };
    const message = await this.chatService.votePoll(dto?.messageId, client.data.userId, dto?.optionIds);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageUpdated', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('closePoll')
  async onClosePoll(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { messageId: string }) {
    const message = await this.chatService.closePoll(dto?.messageId, client.data.userId);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageUpdated', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    // Silently drop floods -- typing indicators are best-effort and not worth an error toast.
    if (this.rateLimited(client, 'typing', 20, 5_000)) return;
    client.to(`conversation:${conversationId}`).emit('userTyping', {
      conversationId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('stopTyping')
  onStopTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    if (this.rateLimited(client, 'typing', 20, 5_000)) return;
    client.to(`conversation:${conversationId}`).emit('userStopTyping', {
      conversationId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('editMessage')
  async onEditMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & EditMessageDto,
  ) {
    const message = await this.chatService.editMessage(dto.messageId, client.data.userId, dto.text);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageEdited', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('deleteMessage')
  async onDeleteMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string; forEveryone: boolean },
  ) {
    const message = await this.chatService.deleteMessage(dto.messageId, client.data.userId, !!dto.forEveryone);
    if (dto.forEveryone) {
      this.server.to(`conversation:${message.conversation.toString()}`).emit('messageDeleted', { message, forEveryone: true });
    } else {
      // "Delete for me" only affects the requester's own view -- echo back to their socket(s)
      // only, distinct from the room-wide broadcast used for "delete for everyone".
      client.emit('messageDeleted', { message, forEveryone: false });
    }
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('reactToMessage')
  async onReactToMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ReactMessageDto,
  ) {
    if (this.rateLimited(client, 'reactToMessage', 30, 10_000)) return { ok: false, rateLimited: true };
    const message = await this.chatService.reactToMessage(dto.messageId, client.data.userId, dto.emoji);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageReacted', message);
    return { ok: true, messageId: message.id };
  }

  // Forwards one message (`messageId`) or a multi-select batch (`messageIds`, kept in order).
  @SubscribeMessage('forwardMessage')
  async onForwardMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId?: string; messageIds?: string[] } & ForwardMessageDto,
  ) {
    if (this.rateLimited(client, 'forwardMessage', 10, 20_000)) {
      throw new WsException('أنت تعيد التوجيه بسرعة كبيرة. تمهّل قليلاً.');
    }
    const ids = Array.isArray(dto?.messageIds) && dto.messageIds.length ? dto.messageIds : dto?.messageId ? [dto.messageId] : [];
    const messages = await this.chatService.forwardMessages(ids, client.data.userId, dto?.conversationIds ?? []);
    messages.forEach((message) => {
      this.server.to(`conversation:${message.conversation.toString()}`).emit('newMessage', message);
    });
    return { ok: true, count: messages.length };
  }

  @SubscribeMessage('markRead')
  async onMarkRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    if (this.rateLimited(client, 'markRead', 40, 10_000)) return { ok: false, rateLimited: true };
    const messageIds = await this.chatService.markRead(conversationId, client.data.userId);
    if (messageIds.length) {
      client.to(`conversation:${conversationId}`).emit('messagesRead', {
        conversationId,
        userId: client.data.userId,
        messageIds,
      });
    }
    return { ok: true, conversationId };
  }

  @SubscribeMessage('markDelivered')
  async onMarkDelivered(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    if (this.rateLimited(client, 'markDelivered', 40, 10_000)) return { ok: false, rateLimited: true };
    const messageIds = await this.chatService.markDelivered(conversationId, client.data.userId);
    if (messageIds.length) {
      client.to(`conversation:${conversationId}`).emit('messagesDelivered', {
        conversationId,
        userId: client.data.userId,
        messageIds,
      });
    }
    return { ok: true, conversationId };
  }

  // --- Group channels (parallel to the conversation handlers above) ---

  @SubscribeMessage('joinChannel')
  async onJoinChannel(@ConnectedSocket() client: AuthedSocket, @MessageBody() channelId: string) {
    await this.groupsService.assertChannelMember(channelId, client.data.userId);
    client.join(`channel:${channelId}`);
    return { ok: true, channelId };
  }

  @SubscribeMessage('sendChannelMessage')
  async onSendChannelMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CreateChannelMessageDto) {
    if (this.rateLimited(client, 'sendChannelMessage', 25, 10_000)) {
      throw new WsException('أنت ترسل الرسائل بسرعة كبيرة. تمهّل قليلاً.');
    }
    const message = await this.groupsService.saveChannelMessage(
      dto.channelId,
      client.data.userId,
      dto.text ?? '',
      dto.attachments,
      dto.replyTo,
      dto.attachmentUrl,
    );

    this.server.to(`channel:${dto.channelId}`).emit('newChannelMessage', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('editChannelMessage')
  async onEditChannelMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & EditMessageDto,
  ) {
    const message = await this.groupsService.editChannelMessage(dto.messageId, client.data.userId, dto.text);
    this.server.to(`channel:${message.channel.toString()}`).emit('channelMessageEdited', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('deleteChannelMessage')
  async onDeleteChannelMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string; forEveryone: boolean },
  ) {
    const message = await this.groupsService.deleteChannelMessage(dto.messageId, client.data.userId, !!dto.forEveryone);
    if (dto.forEveryone) {
      this.server
        .to(`channel:${message.channel.toString()}`)
        .emit('channelMessageDeleted', { message, forEveryone: true });
    } else {
      client.emit('channelMessageDeleted', { message, forEveryone: false });
    }
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('reactToChannelMessage')
  async onReactToChannelMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ReactMessageDto,
  ) {
    if (this.rateLimited(client, 'reactToMessage', 30, 10_000)) return { ok: false, rateLimited: true };
    const message = await this.groupsService.reactToChannelMessage(dto.messageId, client.data.userId, dto.emoji);
    this.server.to(`channel:${message.channel.toString()}`).emit('channelMessageReacted', message);
    return { ok: true, messageId: message.id };
  }

  @SubscribeMessage('channelTyping')
  onChannelTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() channelId: string) {
    if (this.rateLimited(client, 'typing', 20, 5_000)) return;
    client.to(`channel:${channelId}`).emit('userTypingChannel', {
      channelId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('channelStopTyping')
  onChannelStopTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() channelId: string) {
    if (this.rateLimited(client, 'typing', 20, 5_000)) return;
    client.to(`channel:${channelId}`).emit('userStopTypingChannel', {
      channelId,
      userId: client.data.userId,
    });
  }

  // Voice rooms use acknowledged errors so the UI can always release its microphone on a
  // failed join. The service validates both membership and the exact socket for every signal.
  private async voiceAction(client: AuthedSocket, dto: { conversationId?: unknown } | null, action: () => Promise<unknown>) {
    try {
      if (!client.data?.userId || typeof dto?.conversationId !== 'string' || !Types.ObjectId.isValid(dto.conversationId)) {
        throw new WsException('طلب غرفة صوتية غير صالح');
      }
      if (this.rateLimited(client, 'voiceRoom', 500, 10_000)) throw new WsException('محاولات كثيرة، انتظر قليلًا');
      return { ok: true, ...(await action() as object) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'تعذر الاتصال بالغرفة' };
    }
  }

  private async publishVoiceState(conversationId: string) {
    const state = await this.voiceRooms.snapshot(conversationId);
    this.server.to(`voice-room:${conversationId}`).emit('voiceRoom:state', state);
    return state;
  }

  private async leaveVoiceSocket(socketId: string, conversationId?: string) {
    const ids = await this.voiceRooms.leaveSocket(socketId, conversationId);
    await Promise.all(ids.map((id) => this.publishVoiceState(id)));
  }

  @SubscribeMessage('voiceRoom:state')
  voiceState(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string }) {
    return this.voiceAction(client, dto, async () => {
      const state = await this.voiceRooms.state(client.data.userId, dto.conversationId);
      await client.join(`voice-room:${dto.conversationId}`);
      this.server.to(`voice-room:${dto.conversationId}`).emit('voiceRoom:state', state);
      return state;
    });
  }

  @SubscribeMessage('voiceRoom:join')
  voiceJoin(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string; muted?: boolean }) {
    return this.voiceAction(client, dto, async () => {
      if (this.joiningVoice.has(client.id)) throw new WsException('جارٍ الانضمام بالفعل');
      this.joiningVoice.add(client.id);
      try {
        await this.leaveVoiceSocket(client.id);
        const state = await this.voiceRooms.join(client.data.userId, client.id, dto.conversationId, dto.muted !== false);
        // A disconnect may have arrived while the database join was still pending.
        if (!client.connected) {
          await this.leaveVoiceSocket(client.id);
          throw new WsException('انقطع الاتصال، حاول مجددًا');
        }
        await client.join(`voice-room:${dto.conversationId}`);
        this.server.to(`voice-room:${dto.conversationId}`).emit('voiceRoom:state', state);
        return state;
      } finally {
        this.joiningVoice.delete(client.id);
      }
    });
  }

  @SubscribeMessage('voiceRoom:leave')
  voiceLeave(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string; unwatch?: boolean }) {
    return this.voiceAction(client, dto, async () => {
      await this.leaveVoiceSocket(client.id, dto.conversationId);
      if (dto.unwatch) await client.leave(`voice-room:${dto.conversationId}`);
      return {};
    });
  }

  @SubscribeMessage('voiceRoom:heartbeat')
  voiceHeartbeat(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string }) {
    return this.voiceAction(client, dto, () => this.voiceRooms.heartbeat(client.data.userId, client.id, dto.conversationId));
  }

  @SubscribeMessage('voiceRoom:mute')
  voiceMute(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string; muted: boolean }) {
    return this.voiceAction(client, dto, async () => {
      if (typeof dto.muted !== 'boolean') throw new WsException('حالة الميكروفون غير صالحة');
      await this.voiceRooms.mute(client.data.userId, client.id, dto.conversationId, dto.muted);
      return this.publishVoiceState(dto.conversationId);
    });
  }

  @SubscribeMessage('voiceRoom:signal')
  voiceSignal(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: {
    conversationId: string; toSocketId: string;
    description?: { type: string; sdp: string }; candidate?: { candidate?: string };
  }) {
    return this.voiceAction(client, dto, async () => {
      if (typeof dto.toSocketId !== 'string' || dto.toSocketId.length > 100) throw new WsException('مستلم غير صالح');
      const description = dto.description;
      const candidate = dto.candidate;
      if (description) {
        if (!['offer', 'answer'].includes(description.type) || typeof description.sdp !== 'string' || description.sdp.length > 100_000) {
          throw new WsException('وصف اتصال غير صالح');
        }
      } else if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096) {
        throw new WsException('إشارة اتصال غير صالحة');
      }
      const target = await this.voiceRooms.relayTarget(client.data.userId, client.id, dto.conversationId, dto.toSocketId);
      this.server.to(target).emit('voiceRoom:signal', {
        conversationId: dto.conversationId, fromSocketId: client.id,
        ...(description ? { description } : { candidate }),
      });
      return {};
    });
  }

  // --- WebRTC call signaling (1-to-1 voice/video calls) ---
  // The server never touches media. It validates call SETUP (callUser: same DM, no block, caller
  // card from the DB) and otherwise relays signaling between the two users' personal rooms
  // (`user:<id>`). Every relay carries the call's client-generated `callId`; clients ignore
  // anything for a call they're not in, so the relays stay stateless and multi-instance safe.

  // Shared guard for every relayed call signal.
  private callRelayTarget(client: AuthedSocket, dto: { callId?: unknown; toUserId?: unknown } | null | undefined) {
    if (this.rateLimited(client, 'callSignal', 400, 10_000)) return null;
    if (!dto || !isCallId(dto.callId) || typeof dto.toUserId !== 'string' || !Types.ObjectId.isValid(dto.toUserId)) {
      return null;
    }
    return { callId: dto.callId, toUserId: dto.toUserId };
  }

  @SubscribeMessage('callUser')
  async onCallUser(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { callId: string; toUserId: string; conversationId: string; offer: unknown; callType: string },
  ) {
    if (this.rateLimited(client, 'callUser', 8, 60_000)) {
      throw new WsException('محاولات اتصال كثيرة، انتظر قليلًا ثم حاول مجددًا.');
    }
    const target = this.callRelayTarget(client, dto);
    if (!target || !dto.offer) throw new WsException('طلب اتصال غير صالح');
    const caller = await this.callService.validateCall(client.data.userId, dto.conversationId, target.toUserId);
    const online = await this.presence.isOnline(target.toUserId);
    this.server.to(`user:${target.toUserId}`).emit('incomingCall', {
      callId: target.callId,
      fromUserId: client.data.userId,
      fromUser: caller,
      conversationId: dto.conversationId,
      offer: dto.offer,
      callType: dto.callType === 'video' ? 'video' : 'audio',
    });
    // Nobody's connected to ring -- tell the caller right away so the UI can say so.
    if (!online) client.emit('callPeerOffline', { callId: target.callId });
    return { ok: true, online };
  }

  // Callee's device got the call and is ringing -> caller UI switches "جارٍ الاتصال" to "يرن".
  @SubscribeMessage('callRinging')
  onCallRinging(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string }) {
    const target = this.callRelayTarget(client, dto);
    if (!target) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('callRinging', { callId: target.callId, fromUserId: client.data.userId });
    return { ok: true };
  }

  @SubscribeMessage('answerCall')
  onAnswerCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string; answer: unknown }) {
    const target = this.callRelayTarget(client, dto);
    if (!target || !dto.answer) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('callAnswered', {
      callId: target.callId,
      fromUserId: client.data.userId,
      answer: dto.answer,
    });
    // The callee's other tabs/devices are still ringing -- stop them.
    client.to(`user:${client.data.userId}`).emit('callHandledElsewhere', { callId: target.callId });
    return { ok: true };
  }

  @SubscribeMessage('rejectCall')
  onRejectCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string; reason?: string }) {
    const target = this.callRelayTarget(client, dto);
    if (!target) return { ok: false };
    const reason = dto.reason === 'busy' ? 'busy' : 'declined';
    this.server.to(`user:${target.toUserId}`).emit('callRejected', {
      callId: target.callId,
      fromUserId: client.data.userId,
      reason,
    });
    if (reason === 'declined') client.to(`user:${client.data.userId}`).emit('callHandledElsewhere', { callId: target.callId });
    return { ok: true };
  }

  @SubscribeMessage('endCall')
  onEndCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string }) {
    const target = this.callRelayTarget(client, dto);
    if (!target) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('callEnded', { callId: target.callId, fromUserId: client.data.userId });
    return { ok: true };
  }

  @SubscribeMessage('iceCandidate')
  onIceCandidate(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string; candidate: unknown }) {
    const target = this.callRelayTarget(client, dto);
    if (!target || !dto.candidate) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('iceCandidate', {
      callId: target.callId,
      fromUserId: client.data.userId,
      candidate: dto.candidate,
    });
    return { ok: true };
  }

  // Mid-call renegotiation (audio -> video upgrade, screen share, ICE restart): an SDP offer or
  // answer, relayed as-is ("perfect negotiation" runs on the clients).
  @SubscribeMessage('callRenegotiate')
  onCallRenegotiate(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { callId: string; toUserId: string; description: unknown }) {
    const target = this.callRelayTarget(client, dto);
    if (!target || !dto.description) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('callRenegotiate', {
      callId: target.callId,
      fromUserId: client.data.userId,
      description: dto.description,
    });
    return { ok: true };
  }

  // Mic / camera / screen-share state, so the other side can show "muted" / "camera off".
  @SubscribeMessage('callMediaState')
  onCallMediaState(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { callId: string; toUserId: string; audio?: boolean; video?: boolean; screen?: boolean },
  ) {
    const target = this.callRelayTarget(client, dto);
    if (!target) return { ok: false };
    this.server.to(`user:${target.toUserId}`).emit('callMediaState', {
      callId: target.callId,
      fromUserId: client.data.userId,
      audio: !!dto.audio,
      video: !!dto.video,
      screen: !!dto.screen,
    });
    return { ok: true };
  }

  // The caller's client reports how the call ended; it becomes a call-log bubble in the chat
  // (and, for a missed call, a notification to the other side).
  @SubscribeMessage('callLog')
  async onCallLog(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { callId: string; conversationId: string; callType: string; outcome: string; duration?: number },
  ) {
    if (this.rateLimited(client, 'callLog', 10, 60_000)) return { ok: false };
    const { message, created } = await this.callService.logCall(client.data.userId, dto);
    if (created) this.server.to(`conversation:${dto.conversationId}`).emit('newMessage', message);
    return { ok: true };
  }

  // "يسجل رسالة صوتية…" -- the voice-note twin of the typing indicator.
  @SubscribeMessage('recordingVoice')
  onRecordingVoice(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: { conversationId: string; active: boolean }) {
    if (this.rateLimited(client, 'typing', 20, 5_000)) return;
    if (!dto || typeof dto.conversationId !== 'string') return;
    client.to(`conversation:${dto.conversationId}`).emit('userRecording', {
      conversationId: dto.conversationId,
      userId: client.data.userId,
      active: !!dto.active,
    });
  }
}
