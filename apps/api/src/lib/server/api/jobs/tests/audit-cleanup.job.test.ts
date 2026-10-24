import type { Processor } from 'bullmq';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditRepository } from '#lib/server/api/audit/audit.repository';
import { createInMemoryAuditRepository, type InMemoryAuditRepository } from '#lib/server/api/common/testing/in-memory-audit-repository';
import { createTestContainer, mockProvider } from '#lib/server/api/common/testing/test-container';
import { AUDIT_CLEANUP_JOB, AUDIT_CLEANUP_QUEUE, AUDIT_RETENTION_DAYS, AuditCleanupJob } from '#lib/server/api/jobs/audit-cleanup.job';
import { JobsService } from '#lib/server/api/jobs/jobs.service';

/**
 * Fake BullMQ seam standing in for a live Redis connection. `createQueue`
 * records every enqueue; `createWorker` captures the processor so the test can
 * invoke it as BullMQ would when a job runs.
 */
function createFakeJobsService() {
  const added: Array<{ id: string; repeat: unknown; template: unknown }> = [];
  let captured: Processor | null = null;

  const jobsService = {
    added,
    get processor() {
      return captured;
    },
    createQueue(_name: string) {
      return {
        name: _name,
        upsertJobScheduler: vi.fn(async (id: string, repeat: unknown, template: unknown) => {
          added.push({ id, repeat, template });
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
  let repository: InMemoryAuditRepository;
  let jobsService: ReturnType<typeof createFakeJobsService>;

  beforeEach(() => {
    ({ job, repository, jobsService } = build());
  });

  it('enqueues the repeatable cleanup job and starts a worker on register', async () => {
    await job.register();

    expect(jobsService.added).toHaveLength(1);
    expect(jobsService.added[0]).toMatchObject({
      id: AUDIT_CLEANUP_JOB,
      repeat: { pattern: '0 0 * * 0' },
      template: { name: AUDIT_CLEANUP_JOB },
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
