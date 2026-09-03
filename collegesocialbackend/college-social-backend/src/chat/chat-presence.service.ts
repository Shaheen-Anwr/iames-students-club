import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

// Live socket-count presence for the chat gateway. Two backends, same semantics:
//   * no REDIS_URL  -> a per-process Map (single instance; unchanged behaviour)
//   * REDIS_URL set -> a Redis hash `chat:presence` { userId -> live socket count }, so the
//     admin "online now" count and the first/last-socket decisions are correct across every
//     backend instance behind the Socket.IO Redis adapter.
//
// The hash key carries a rolling 1h TTL (bumped on every mutation) so that if the WHOLE cluster
// goes down, stale entries clear on their own rather than pinning the count forever. Fields
// leaked by a single crashed instance among several are minor drift on an admin tile -- a
// heartbeat reaper is the real fix and is noted as a follow-up.
@Injectable()
export class ChatPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPresenceService.name);
  private readonly mem = new Map<string, number>();
  private redis?: RedisClientType;
  private static readonly KEY = 'chat:presence';
  private static readonly TTL_SECONDS = 3600;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('redisUrl');
    if (!url) return;
    try {
      const client: RedisClientType = createClient({ url });
      client.on('error', (err) => this.logger.error(`presence redis error: ${err.message}`));
      await client.connect();
      this.redis = client;
      this.logger.log('Chat presence backed by Redis');
    } catch (err) {
      this.logger.warn(`Redis unavailable, chat presence stays per-process: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  /** Record a new socket for the user. Returns true when this is their first live socket. */
  async track(userId: string): Promise<boolean> {
    if (this.redis) {
      const next = await this.redis.hIncrBy(ChatPresenceService.KEY, userId, 1);
      await this.redis.expire(ChatPresenceService.KEY, ChatPresenceService.TTL_SECONDS);
      return next === 1;
    }
    const next = (this.mem.get(userId) ?? 0) + 1;
    this.mem.set(userId, next);
    return next === 1;
  }

  /** Drop a socket for the user. Returns true when they still have another socket connected. */
  async untrack(userId: string): Promise<boolean> {
    if (this.redis) {
      const next = await this.redis.hIncrBy(ChatPresenceService.KEY, userId, -1);
      if (next <= 0) {
        await this.redis.hDel(ChatPresenceService.KEY, userId);
        return false;
      }
      await this.redis.expire(ChatPresenceService.KEY, ChatPresenceService.TTL_SECONDS);
      return true;
    }
    const next = (this.mem.get(userId) ?? 1) - 1;
    if (next <= 0) {
      this.mem.delete(userId);
      return false;
    }
    this.mem.set(userId, next);
    return true;
  }

  /** True when the user currently has at least one live socket (used by the offline-grace check). */
  async isOnline(userId: string): Promise<boolean> {
    if (this.redis) {
      const raw = await this.redis.hGet(ChatPresenceService.KEY, userId);
      return raw !== undefined && raw !== null && Number(raw) > 0;
    }
    return (this.mem.get(userId) ?? 0) > 0;
  }

  /** Distinct users with at least one live socket -- the admin dashboard's "online now" tile. */
  async distinctCount(): Promise<number> {
    if (this.redis) return this.redis.hLen(ChatPresenceService.KEY);
    return this.mem.size;
  }
}
