import { Logger } from '@nestjs/common';
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

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    collegeId: string;
    role: string;
    // Per-socket rate-limit buckets: action name -> recent hit timestamps. See rateLimited().
    rl?: Map<string, number[]>;
  };
}

interface CallSignalPayload {
  toUserId: string;
  conversationId: string;
  [key: string]: unknown;
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly groupsService: GroupsService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly usersService: UsersService,
    private readonly presence: ChatPresenceService,
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
      // Public groups the user hasn't joined still belong in their live feed -- join those
      // rooms too, but keep them OUT of the presence-broadcast loop below so a reconnect storm
      // doesn't fan presence writes across every public group.
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
        conversationIds.forEach((id) =>
          client.to(`conversation:${id}`).emit('presenceUpdate', { userId: payload.sub, isOnline: true }),
        );
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
        void this.chatService
          .listConversationIdsForUser(userId)
          .then((ids) =>
            ids.forEach((id) =>
              this.server.to(`conversation:${id}`).emit('presenceUpdate', { userId, isOnline: false, lastSeenAt }),
            ),
          )
          .catch(() => undefined);
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

  @SubscribeMessage('joinConversation')
  async onJoinConversation(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    await this.chatService.assertCanAccessConversation(conversationId, client.data.userId);
    client.join(`conversation:${conversationId}`);
    return { event: 'joinedConversation', conversationId };
  }

  @SubscribeMessage('sendMessage')
  async onSendMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CreateMessageDto) {
    if (this.rateLimited(client, 'sendMessage', 25, 10_000)) {
      throw new WsException('أنت ترسل الرسائل بسرعة كبيرة. تمهّل قليلاً.');
    }
    const message = await this.chatService.saveMessage(
      dto.conversationId,
      client.data.userId,
      dto.text ?? '',
      dto.attachments,
      dto.replyTo,
    );

    // Broadcast to everyone in the room, including the sender (so all their tabs update)
    this.server.to(`conversation:${dto.conversationId}`).emit('newMessage', message);
    return { event: 'messageSent', messageId: message.id };
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
    return { event: 'messageEdited', messageId: message.id };
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
    return { event: 'messageDeleted', messageId: message.id };
  }

  @SubscribeMessage('reactToMessage')
  async onReactToMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ReactMessageDto,
  ) {
    if (this.rateLimited(client, 'reactToMessage', 30, 10_000)) return { event: 'messageReacted' };
    const message = await this.chatService.reactToMessage(dto.messageId, client.data.userId, dto.emoji);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageReacted', message);
    return { event: 'messageReacted', messageId: message.id };
  }

  @SubscribeMessage('forwardMessage')
  async onForwardMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ForwardMessageDto,
  ) {
    if (this.rateLimited(client, 'forwardMessage', 10, 20_000)) {
      throw new WsException('أنت تعيد التوجيه بسرعة كبيرة. تمهّل قليلاً.');
    }
    const messages = await this.chatService.forwardMessage(dto.messageId, client.data.userId, dto.conversationIds);
    messages.forEach((message) => {
      this.server.to(`conversation:${message.conversation.toString()}`).emit('newMessage', message);
    });
    return { event: 'messageForwarded', count: messages.length };
  }

  @SubscribeMessage('markRead')
  async onMarkRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    if (this.rateLimited(client, 'markRead', 40, 10_000)) return { event: 'read', conversationId };
    const messageIds = await this.chatService.markRead(conversationId, client.data.userId);
    if (messageIds.length) {
      client.to(`conversation:${conversationId}`).emit('messagesRead', {
        conversationId,
        userId: client.data.userId,
        messageIds,
      });
    }
    return { event: 'read', conversationId };
  }

  @SubscribeMessage('markDelivered')
  async onMarkDelivered(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    if (this.rateLimited(client, 'markDelivered', 40, 10_000)) return { event: 'delivered', conversationId };
    const messageIds = await this.chatService.markDelivered(conversationId, client.data.userId);
    if (messageIds.length) {
      client.to(`conversation:${conversationId}`).emit('messagesDelivered', {
        conversationId,
        userId: client.data.userId,
        messageIds,
      });
    }
    return { event: 'delivered', conversationId };
  }

  // --- Group channels (parallel to the conversation handlers above) ---

  @SubscribeMessage('joinChannel')
  async onJoinChannel(@ConnectedSocket() client: AuthedSocket, @MessageBody() channelId: string) {
    await this.groupsService.assertChannelMember(channelId, client.data.userId);
    client.join(`channel:${channelId}`);
    return { event: 'joinedChannel', channelId };
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
    return { event: 'channelMessageSent', messageId: message.id };
  }

  @SubscribeMessage('editChannelMessage')
  async onEditChannelMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & EditMessageDto,
  ) {
    const message = await this.groupsService.editChannelMessage(dto.messageId, client.data.userId, dto.text);
    this.server.to(`channel:${message.channel.toString()}`).emit('channelMessageEdited', message);
    return { event: 'channelMessageEdited', messageId: message.id };
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
    return { event: 'channelMessageDeleted', messageId: message.id };
  }

  @SubscribeMessage('reactToChannelMessage')
  async onReactToChannelMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ReactMessageDto,
  ) {
    if (this.rateLimited(client, 'reactToMessage', 30, 10_000)) return { event: 'channelMessageReacted' };
    const message = await this.groupsService.reactToChannelMessage(dto.messageId, client.data.userId, dto.emoji);
    this.server.to(`channel:${message.channel.toString()}`).emit('channelMessageReacted', message);
    return { event: 'channelMessageReacted', messageId: message.id };
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

  // --- WebRTC call signaling (1-to-1 voice/video calls) ---
  // The server never touches media -- it only relays SDP offers/answers and ICE candidates
  // between the two peers' personal rooms (`user:${id}`, joined at connect time above).

  @SubscribeMessage('callUser')
  onCallUser(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CallSignalPayload & { offer: unknown; callType: 'audio' | 'video' }) {
    this.server.to(`user:${dto.toUserId}`).emit('incomingCall', {
      fromUserId: client.data.userId,
      conversationId: dto.conversationId,
      offer: dto.offer,
      callType: dto.callType,
    });
  }

  @SubscribeMessage('answerCall')
  onAnswerCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CallSignalPayload & { answer: unknown }) {
    this.server.to(`user:${dto.toUserId}`).emit('callAnswered', {
      fromUserId: client.data.userId,
      answer: dto.answer,
    });
  }

  @SubscribeMessage('iceCandidate')
  onIceCandidate(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CallSignalPayload & { candidate: unknown }) {
    this.server.to(`user:${dto.toUserId}`).emit('iceCandidate', {
      fromUserId: client.data.userId,
      candidate: dto.candidate,
    });
  }

  @SubscribeMessage('endCall')
  onEndCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CallSignalPayload) {
    this.server.to(`user:${dto.toUserId}`).emit('callEnded', { fromUserId: client.data.userId });
  }

  @SubscribeMessage('rejectCall')
  onRejectCall(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CallSignalPayload) {
    this.server.to(`user:${dto.toUserId}`).emit('callRejected', { fromUserId: client.data.userId });
  }
}
