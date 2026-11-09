import { inject, injectable } from '@needle-di/core';
import type { Job, Queue, Worker } from 'bullmq';
import dayjs from 'dayjs';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { JobsService } from './jobs.service';

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

/** Queue that owns audit-log retention work. */
export const AUDIT_CLEANUP_QUEUE = 'audit-cleanup';

/** The single named job on {@link AUDIT_CLEANUP_QUEUE}. */
export const AUDIT_CLEANUP_JOB = 'prune-stale-audit-logs';

/** How long audit rows are retained before the cleanup job prunes them. */
export const AUDIT_RETENTION_DAYS = 90;

/** Cron pattern: run once a week at midnight on Sunday. */
const AUDIT_CLEANUP_SCHEDULE = '0 0 * * 0';

/** How long {@link AuditCleanupJob.register} waits for Redis. BullMQ retries forever when Redis is down, so without this the boot hangs. */
export const JOB_REGISTER_TIMEOUT_MS = 10_000;

export interface AuditCleanupResult {
  deleted: number;
}

/* -------------------------------------------------------------------------- */
/*                                    Job                                     */
/* -------------------------------------------------------------------------- */

/**
 * Example background job: prunes audit-log rows older than
 * {@link AUDIT_RETENTION_DAYS}. Serves as the template for new jobs.
 *
 * Lazy by design — the queue and worker (and their Redis connections) are only
 * created when {@link register} runs at application startup, never at import or
 * construction time.
 */
@injectable()
export class AuditCleanupJob {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly jobsService = inject(JobsService),
    private readonly auditRepository = inject(AuditRepository),
  ) {}

  private getQueue(): Queue {
    this.queue ??= this.jobsService.createQueue(AUDIT_CLEANUP_QUEUE);
    return this.queue;
  }

  /**
   * Schedule the repeatable cleanup and start the worker that runs it. Call
   * once during application startup. Opens Redis connections, so it must not
   * run at import time. Fails after {@link JOB_REGISTER_TIMEOUT_MS} if Redis
   * has not answered, closing whatever it opened.
   */
  async register(): Promise<void> {
    let limitTimer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_resolve, reject) => {
      limitTimer = setTimeout(
        () => reject(new Error(`Job registration did not finish within ${JOB_REGISTER_TIMEOUT_MS}ms; check that Redis is reachable at REDIS_URL`)),
        JOB_REGISTER_TIMEOUT_MS,
      );
    });

    try {
      const scheduled = this.getQueue().upsertJobScheduler(
        AUDIT_CLEANUP_JOB,
        { pattern: AUDIT_CLEANUP_SCHEDULE },
        {
          name: AUDIT_CLEANUP_JOB,
          opts: { removeOnComplete: true, removeOnFail: 50 },
        },
      );
      await Promise.race([scheduled, limit]);
    } catch (error) {
      await this.close().catch((closeError) => console.error('Could not close job connections after a failed registration', closeError));
      console.error(`Background job registration failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      clearTimeout(limitTimer);
    }

    this.worker ??= this.jobsService.createWorker(AUDIT_CLEANUP_QUEUE, (job) => this.process(job));
  }

  /**
   * Process a single cleanup job: delete audit rows older than the retention
   * window and report how many were removed. Unknown job names are a no-op so a
   * stray enqueue never deletes data.
   */
  async process(job: Pick<Job, 'name'>): Promise<AuditCleanupResult> {
    if (job.name !== AUDIT_CLEANUP_JOB) {
      return { deleted: 0 };
    }

    const cutoff = dayjs().subtract(AUDIT_RETENTION_DAYS, 'day').toDate();
    const deleted = await this.auditRepository.deleteOlderThan(cutoff);
    console.info(`audit cleanup deleted ${deleted} rows older than ${AUDIT_RETENTION_DAYS} days`);
    return { deleted };
  }

  /** Close the queue and worker connections during graceful shutdown. */
  async close(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
    this.worker = null;
    this.queue = null;
  }
}
