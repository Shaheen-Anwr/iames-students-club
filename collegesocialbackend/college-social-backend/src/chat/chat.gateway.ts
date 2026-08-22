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
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { GroupsService } from '../groups/groups.service';
import { CreateChannelMessageDto } from '../groups/dto/create-channel-message.dto';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';

interface AuthedSocket extends Socket {
  data: { userId: string; collegeId: string; role: string };
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
  cors: { origin: process.env.CORS_ORIGIN ?? 'https://iames-students-club-roan.vercel.app', credentials: true },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly groupsService: GroupsService,
    private readonly realtimeEmitter: RealtimeEmitterService,
    private readonly usersService: UsersService,
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

      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.collegeId = payload.collegeId;
      client.data.role = payload.role;

      // Auto-join a room per conversation the user belongs to, so messages
      // reach them even if they haven't explicitly called joinConversation yet.
      const conversations = await this.chatService.listConversationsForUser(payload.sub);
      conversations.forEach((c) => client.join(`conversation:${c._id}`));

      // Same for group channels.
      const channelIds = await this.groupsService.listMyChannelIds(payload.sub);
      channelIds.forEach((id) => client.join(`channel:${id}`));

      // Personal room -- lets RealtimeEmitterService reach this user's active socket(s) for
      // notifications, regardless of which conversation/channel/page they're currently on.
      client.join(`user:${payload.sub}`);

      // Admin dashboard live signal: admins additionally join a shared room so
      // RealtimeEmitterService.emitToAdmins() can push presence/activity updates to them.
      if (payload.role === Role.ADMIN) {
        client.join('admins');
      }

      // Presence: mark online and tell everyone sharing a conversation with this user.
      await this.usersService.setOnline(payload.sub, true);
      conversations.forEach((c) =>
        client.to(`conversation:${c._id}`).emit('presenceUpdate', { userId: payload.sub, isOnline: true }),
      );
      this.broadcastOnlineCountToAdmins();

      this.logger.log(`Client connected: user=${payload.sub} socket=${client.id}`);
    } catch (err) {
      this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    this.logger.log(`Client disconnected: socket=${client.id}`);
    const userId = client.data?.userId;
    if (!userId) return;

    // A user may have other tabs/devices still connected -- only announce "offline" if this
    // was their last active socket in the room.
    const remainingSockets = await this.server.in(`user:${userId}`).fetchSockets();
    if (remainingSockets.length > 0) return;

    const lastSeenAt = new Date();
    await this.usersService.setOnline(userId, false, lastSeenAt);
    const conversations = await this.chatService.listConversationsForUser(userId);
    conversations.forEach((c) =>
      this.server.to(`conversation:${c._id}`).emit('presenceUpdate', { userId, isOnline: false, lastSeenAt }),
    );
    this.broadcastOnlineCountToAdmins();
  }

  // Admin dashboard "online now" tile -- fired on every connect/disconnect so it stays live
  // without polling. Fire-and-forget: a failed count read just means a stale tile, never a
  // user-facing error.
  private broadcastOnlineCountToAdmins(): void {
    void this.usersService.countOnline().then((online) => {
      this.realtimeEmitter.emitToAdmins('admin:presence', { online });
    });
  }

  @SubscribeMessage('joinConversation')
  async onJoinConversation(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
    await this.chatService.assertParticipant(conversationId, client.data.userId);
    client.join(`conversation:${conversationId}`);
    return { event: 'joinedConversation', conversationId };
  }

  @SubscribeMessage('sendMessage')
  async onSendMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: CreateMessageDto) {
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
    client.to(`conversation:${conversationId}`).emit('userTyping', {
      conversationId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('stopTyping')
  onStopTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
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
    const message = await this.chatService.reactToMessage(dto.messageId, client.data.userId, dto.emoji);
    this.server.to(`conversation:${message.conversation.toString()}`).emit('messageReacted', message);
    return { event: 'messageReacted', messageId: message.id };
  }

  @SubscribeMessage('forwardMessage')
  async onForwardMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: { messageId: string } & ForwardMessageDto,
  ) {
    const messages = await this.chatService.forwardMessage(dto.messageId, client.data.userId, dto.conversationIds);
    messages.forEach((message) => {
      this.server.to(`conversation:${message.conversation.toString()}`).emit('newMessage', message);
    });
    return { event: 'messageForwarded', count: messages.length };
  }

  @SubscribeMessage('markRead')
  async onMarkRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() conversationId: string) {
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
    const message = await this.groupsService.saveChannelMessage(
      dto.channelId,
      client.data.userId,
      dto.text ?? '',
      dto.attachmentUrl,
    );

    this.server.to(`channel:${dto.channelId}`).emit('newChannelMessage', message);
    return { event: 'channelMessageSent', messageId: message.id };
  }

  @SubscribeMessage('channelTyping')
  onChannelTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() channelId: string) {
    client.to(`channel:${channelId}`).emit('userTypingChannel', {
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
