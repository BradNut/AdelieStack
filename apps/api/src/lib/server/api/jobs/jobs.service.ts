import { inject, injectable } from '@needle-di/core';
import { type Processor, Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq';
import { ConfigService } from '../common/configs/config.service';

/**
 * Thin factory over BullMQ that owns the single place a Redis connection is
 * configured for background work. Nothing connects at import or construction
 * time: a Queue/Worker (and therefore a Redis socket) is only opened when a
 * caller invokes {@link createQueue} or {@link createWorker}. Reuses the same
 * `REDIS_URL` as sessions and rate limiting.
 */
@injectable()
export class JobsService {
  constructor(private readonly configService = inject(ConfigService)) {}

  /** Connection options shared by every queue and worker this service creates. */
  private get connection(): QueueOptions['connection'] {
    return { url: this.configService.envs.REDIS_URL };
  }

  createQueue<T = unknown>(name: string): Queue<T> {
    return new Queue<T>(name, { connection: this.connection });
  }

  createWorker<T = unknown>(
    queueName: string,
    processor: Processor<T, unknown, string>,
    options?: Omit<WorkerOptions, 'connection'>,
  ): Worker<T, unknown, string> {
    return new Worker<T, unknown, string>(queueName, processor, { ...options, connection: this.connection });
  }
}
