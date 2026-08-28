import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Opt-in Socket.IO Redis adapter. Only used when REDIS_URL is set (see main.ts). With it, the
 * chat gateway can run across several backend instances behind a sticky-session load balancer:
 * every `server.to(room).emit(...)` and `fetchSockets()` is relayed through Redis pub/sub so a
 * message sent on instance A still reaches a socket connected to instance B.
 *
 * Without REDIS_URL the app keeps the default in-memory adapter (single instance), which is what
 * this deployment runs today -- this class is simply never instantiated in that case.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(url: string): Promise<void> {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();

    // Don't let a transient Redis blip crash the process -- log and let node-redis reconnect.
    pubClient.on('error', (err) => this.logger.error(`Redis pub client error: ${err.message}`));
    subClient.on('error', (err) => this.logger.error(`Redis sub client error: ${err.message}`));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
