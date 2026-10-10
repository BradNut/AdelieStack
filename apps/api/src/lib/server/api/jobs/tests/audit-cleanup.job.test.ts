import type { Processor } from 'bullmq';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditRepository } from '../../audit/audit.repository';
import type { AuditLog } from '../../audit/tables/audit_log.table';
import { createTestContainer, mockProvider } from '../../common/testing/test-container';
import { generateId } from '../../common/utils/crypto';
import { AUDIT_CLEANUP_JOB, AUDIT_CLEANUP_QUEUE, AUDIT_RETENTION_DAYS, AuditCleanupJob } from '../audit-cleanup.job';
import { JobsService } from '../jobs.service';

/**
 * In-memory stand-in for {@link AuditRepository}. It genuinely stores rows and
 * applies the retention cutoff, so the job's effect (pruning stale rows) is
 * asserted for real rather than through mock calls.
 */
function createInMemoryAuditRepository() {
  const rows: AuditLog[] = [];

  function seed(createdAt: Date): string {
    const id = generateId();
    rows.push({
      id,
      actor_user_id: null,
      action: 'login_succeeded',
      entity_type: 'session',
      entity_id: null,
      request_id: null,
      ip: null,
      user_agent: null,
      metadata: null,
      createdAt,
      updatedAt: createdAt,
    });
    return id;
  }

  const repository = {
    rows,
    seed,
    async deleteOlderThan(cutoff: Date): Promise<number> {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].createdAt < cutoff) rows.splice(i, 1);
      }
      return before - rows.length;
    },
  };

  return repository;
}

/**
 * Fake BullMQ seam standing in for a live Redis connection. `createQueue`
 * records every enqueue; `createWorker` captures the processor so the test can
 * invoke it as BullMQ would when a job runs.
 */
function createFakeJobsService() {
  const added: Array<{ name: string; data: unknown; opts: unknown }> = [];
  let captured: Processor | null = null;

  const jobsService = {
    added,
    get processor() {
      return captured;
    },
    createQueue(_name: string) {
      return {
        name: _name,
        add: vi.fn(async (name: string, data: unknown, opts: unknown) => {
          added.push({ name, data, opts });
        }),
      };
    },
    createWorker(_queueName: string, processor: Processor) {
      captured = processor;
      return { close: vi.fn(async () => {}) };
    },
  };

  return jobsService;
}

function build() {
  const repository = createInMemoryAuditRepository();
  const jobsService = createFakeJobsService();
  const container = createTestContainer(mockProvider(AuditRepository, repository), mockProvider(JobsService, jobsService));
  return { job: container.get(AuditCleanupJob), repository, jobsService };
}

describe('AuditCleanupJob', () => {
  let job: AuditCleanupJob;
  let repository: ReturnType<typeof createInMemoryAuditRepository>;
  let jobsService: ReturnType<typeof createFakeJobsService>;

  beforeEach(() => {
    ({ job, repository, jobsService } = build());
  });

  it('enqueues the repeatable cleanup job and starts a worker on register', async () => {
    await job.register();

    expect(jobsService.added).toHaveLength(1);
    expect(jobsService.added[0]).toMatchObject({
      name: AUDIT_CLEANUP_JOB,
      opts: { repeat: { pattern: '0 0 * * 0' } },
    });
    // Worker processor was registered for the cleanup queue.
    expect(jobsService.processor).toBeTypeOf('function');
  });

  it('prunes audit rows older than the retention window when the job runs', async () => {
    const staleId = repository.seed(
      dayjs()
        .subtract(AUDIT_RETENTION_DAYS + 5, 'day')
        .toDate(),
    );
    const freshId = repository.seed(dayjs().subtract(1, 'day').toDate());

    await job.register();
    const processor = jobsService.processor;
    if (!processor) throw new Error('worker processor was not registered');

    // Run the job exactly as BullMQ would hand it to the worker.
    const result = await processor({ name: AUDIT_CLEANUP_JOB } as never, undefined as never);

    expect(result).toEqual({ deleted: 1 });
    expect(repository.rows.map((row) => row.id)).toEqual([freshId]);
    expect(repository.rows.some((row) => row.id === staleId)).toBe(false);
  });

  it('is a no-op for unknown job names so stray enqueues never delete data', async () => {
    repository.seed(
      dayjs()
        .subtract(AUDIT_RETENTION_DAYS + 5, 'day')
        .toDate(),
    );

    const result = await job.process({ name: 'some-other-job' });

    expect(result).toEqual({ deleted: 0 });
    expect(repository.rows).toHaveLength(1);
  });

  it('uses a dedicated queue name', () => {
    expect(AUDIT_CLEANUP_QUEUE).toBe('audit-cleanup');
  });
});
