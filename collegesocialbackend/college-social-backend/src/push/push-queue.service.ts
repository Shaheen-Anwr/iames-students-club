import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { PushService, type PushEnqueuer } from './push.service';
import { PushPayload } from './push-payload.util';

// Durable, retrying delivery for Web Push. Without REDIS_URL this is inert -- PushService keeps
// sending inline exactly as before. With REDIS_URL, PushService.sendToUser/sendToUsers enqueue
// here instead and a worker (in this process for now; move to its own Render service later by
// running the app with the web server disabled) drains the queue with bounded concurrency and
// exponential-backoff retries, so a push survives a deploy/restart and a flaky push endpoint
// doesn't spend request-handler CPU.
@Injectable()
export class PushQueueService implements OnModuleInit, OnModuleDestroy, PushEnqueuer {
  private readonly logger = new Logger(PushQueueService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  private static readonly QUEUE = 'push';
  private static readonly JOB_OPTS: JobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly pushService: PushService,
  ) {}

  get enabled(): boolean {
    return !!this.queue;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.logger.log('No REDIS_URL -- push delivery stays inline (no queue).');
      return;
    }
    try {
      // BullMQ requires maxRetriesPerRequest: null on its blocking connection.
      this.connection = new IORedis(url, { maxRetriesPerRequest: null });
      this.queue = new Queue(PushQueueService.QUEUE, { connection: this.connection });
      this.worker = new Worker(
        PushQueueService.QUEUE,
        async (job) => {
          if (job.name === 'user') {
            await this.pushService.deliverToUser(job.data.userId, job.data.payload);
          } else if (job.name === 'users') {
            await this.pushService.deliverToUsers(job.data.userIds, job.data.payload);
          }
        },
        { connection: this.connection, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.warn(`push job ${job?.id} (${job?.name}) failed: ${err.message}`),
      );
      this.pushService.attachQueue(this);
      this.logger.log('Push delivery queue active (BullMQ).');
    } catch (err) {
      this.logger.error(`Failed to start push queue, falling back to inline: ${(err as Error).message}`);
      await this.teardown();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
    this.worker = undefined;
    this.queue = undefined;
    this.connection = undefined;
  }

  async enqueueUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.queue) return this.pushService.deliverToUser(userId, payload);
    await this.queue.add('user', { userId, payload }, PushQueueService.JOB_OPTS);
  }

  async enqueueUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.queue) return this.pushService.deliverToUsers(userIds, payload);
    await this.queue.add('users', { userIds, payload }, PushQueueService.JOB_OPTS);
  }
}
