import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

/**
 * Small read-through cache for hot aggregate endpoints (dashboard, course overview, leaderboard).
 *
 * Backed by Redis when REDIS_URL is set -- shared across every backend instance, so a value
 * computed on instance A is served from cache on instance B. With no REDIS_URL it falls back to a
 * per-process Map with the same TTL semantics: still useful on a single instance, just not shared.
 *
 * This is deliberately not @nestjs/cache-manager -- we only need get / set / wrap / prefix-delete,
 * and keeping it tiny means the Redis dependency is optional at runtime, matching how the rest of
 * the app treats Redis (see redis-io.adapter.ts).
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis?: RedisClientType;
  private readonly mem = new Map<string, { value: string; expiresAt: number }>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('redisUrl');
    if (url) {
      try {
        const client: RedisClientType = createClient({
          url,
          socket: {
            connectTimeout: 10_000,
            reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
          },
        });
        client.on('error', (err) => this.logger.error(`Redis cache client error: ${err.message}`));
        await client.connect();
        this.redis = client;
        this.logger.log('Cache backed by Redis');
      } catch (err) {
        this.logger.warn(`Redis unavailable, using in-process cache: ${(err as Error).message}`);
      }
    }
    if (!this.redis) {
      // Evict expired keys periodically so a long-running process doesn't accumulate dead entries.
      this.sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of this.mem) if (entry.expiresAt <= now) this.mem.delete(key);
      }, 60_000);
      this.sweepTimer.unref?.();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      if (this.redis) {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
      }
      const entry = this.mem.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        this.mem.delete(key);
        return undefined;
      }
      return JSON.parse(entry.value) as T;
    } catch (err) {
      this.logger.warn(`cache get(${key}) failed: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (this.redis) {
        await this.redis.set(key, raw, { EX: ttlSeconds });
      } else {
        this.mem.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
      }
    } catch (err) {
      this.logger.warn(`cache set(${key}) failed: ${(err as Error).message}`);
    }
  }

  /** Delete one key, or every key starting with `prefix` when it ends in '*'. */
  async del(keyOrPrefix: string): Promise<void> {
    try {
      if (keyOrPrefix.endsWith('*')) {
        const prefix = keyOrPrefix.slice(0, -1);
        if (this.redis) {
          // scanIterator yields a single key (redis@4) or a batch depending on version -- handle both.
          for await (const yielded of this.redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
            const keys = Array.isArray(yielded) ? yielded : [yielded];
            if (keys.length) await this.redis.del(keys);
          }
        } else {
          for (const key of [...this.mem.keys()]) if (key.startsWith(prefix)) this.mem.delete(key);
        }
        return;
      }
      if (this.redis) await this.redis.del(keyOrPrefix);
      else this.mem.delete(keyOrPrefix);
    } catch (err) {
      this.logger.warn(`cache del(${keyOrPrefix}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Read `key`; on a miss run `producer()`, cache the result for `ttlSeconds`, and return it.
   * A failing `producer()` is never cached. Concurrent callers on one instance may both run the
   * producer on a cold key -- acceptable for these low-cardinality aggregates.
   */
  async wrap<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await producer();
    // Don't cache empty-ish sentinels forever; still cache them briefly to absorb bursts.
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
