import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

// Bridges HTTP-only services (e.g. PostsService) to the Socket.IO server owned by ChatGateway,
// without those modules needing to depend on ChatModule (would create a circular import).
// ChatGateway calls setServer() once from its afterInit lifecycle hook.
@Injectable()
export class RealtimeEmitterService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  // Admin dashboard live signal (online count, activity feed) -- sockets join the 'admins' room
  // in ChatGateway.handleConnection when their JWT role is 'admin'.
  emitToAdmins(event: string, payload: unknown) {
    this.server?.to('admins').emit(event, payload);
  }

  // Fan an event out to every connected socket (e.g. a newly-created public group that belongs
  // in everyone's chat list).
  broadcast(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
