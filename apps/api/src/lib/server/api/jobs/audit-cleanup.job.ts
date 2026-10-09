import { inject, injectable } from '@needle-di/core';
import type { Job, Queue, Worker } from 'bullmq';
import dayjs from 'dayjs';
import { AuditRepository } from '../audit/audit.repository';
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
   * run at import time.
   */
  async register(): Promise<void> {
    await this.getQueue().add(AUDIT_CLEANUP_JOB, null, {
      repeat: { pattern: AUDIT_CLEANUP_SCHEDULE },
      removeOnComplete: true,
      removeOnFail: 50,
    });

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
    return { deleted };
  }

  /** Close the queue and worker connections during graceful shutdown. */
  async close(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
    this.worker = null;
    this.queue = null;
  }
}
