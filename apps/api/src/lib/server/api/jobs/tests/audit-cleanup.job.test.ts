import type { Processor } from 'bullmq';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
function createFakeJobsService(upsert?: () => Promise<void>) {
  const added: Array<{ id: string; repeat: unknown; template: unknown }> = [];
  const closeQueue = vi.fn(async () => {});
  let captured: Processor | null = null;

  const jobsService = {
    added,
    closeQueue,
    get processor() {
      return captured;
    },
    createQueue(_name: string) {
      return {
        name: _name,
        upsertJobScheduler: vi.fn(async (id: string, repeat: unknown, template: unknown) => {
          await upsert?.();
          added.push({ id, repeat, template });
        }),
        close: closeQueue,
      };
    },
    createWorker(_queueName: string, processor: Processor) {
      captured = processor;
      return { close: vi.fn(async () => {}) };
    },
  };

  return jobsService;
}

function build(upsert?: () => Promise<void>) {
  const repository = createInMemoryAuditRepository();
  const jobsService = createFakeJobsService(upsert);
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

  it('logs how many rows each run deleted', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    repository.seed(
      dayjs()
        .subtract(AUDIT_RETENTION_DAYS + 5, 'day')
        .toDate(),
    );
    repository.seed(
      dayjs()
        .subtract(AUDIT_RETENTION_DAYS + 6, 'day')
        .toDate(),
    );

    await job.process({ name: AUDIT_CLEANUP_JOB });

    expect(info).toHaveBeenCalledWith(expect.stringContaining('deleted 2 '));
  });

  it('logs a run that deleted nothing', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await job.process({ name: AUDIT_CLEANUP_JOB });

    expect(info).toHaveBeenCalledWith(expect.stringContaining('deleted 0 '));
  });

  describe('when Redis does not answer during register', () => {
    /** The real limit from the issue, written out so a changed constant fails here. */
    const REGISTER_LIMIT_MS = 10_000;
    /** How long a failed registration waits for its connections to close, written out for the same reason. */
    const CLOSE_LIMIT_MS = 2_000;
    let releaseUpsert: () => void;
    let stalled: ReturnType<typeof build>;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      stalled = build(
        () =>
          new Promise<void>((resolve) => {
            releaseUpsert = resolve;
          }),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('is still waiting just before the limit', async () => {
      const settled = vi.fn();
      stalled.job.register().then(settled, settled);

      await vi.advanceTimersByTimeAsync(REGISTER_LIMIT_MS - 1);

      expect(settled).not.toHaveBeenCalled();
      expect(stalled.jobsService.closeQueue).not.toHaveBeenCalled();
      releaseUpsert();
      await vi.advanceTimersByTimeAsync(0);
    });

    it('closes connections, logs a clear error and fails at the limit', async () => {
      const registering = stalled.job.register();
      const failure = expect(registering).rejects.toThrow(/did not finish within 10000ms/);

      await vi.advanceTimersByTimeAsync(REGISTER_LIMIT_MS);
      await failure;

      expect(stalled.jobsService.closeQueue).toHaveBeenCalledOnce();
      expect(console.error).toHaveBeenCalledWith(
        'Background job registration failed',
        expect.objectContaining({ message: expect.stringMatching(/Redis/) }),
      );
      expect(stalled.jobsService.processor).toBeNull();
    });

    it('logs at the limit and still fails when closing the connections never finishes', async () => {
      stalled.jobsService.closeQueue.mockImplementation(() => new Promise<void>(() => {}));
      const settled = vi.fn();
      const registering = stalled.job.register();
      registering.catch(settled);
      const failure = expect(registering).rejects.toThrow(/did not finish within 10000ms/);

      await vi.advanceTimersByTimeAsync(REGISTER_LIMIT_MS);
      expect(stalled.jobsService.closeQueue).toHaveBeenCalledOnce();
      expect(console.error).toHaveBeenCalledWith(
        'Background job registration failed',
        expect.objectContaining({ message: expect.stringMatching(/Redis/) }),
      );
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(CLOSE_LIMIT_MS);
      await failure;
      expect(stalled.jobsService.processor).toBeNull();
    });

    it('starts no worker if Redis answers after the limit', async () => {
      const failure = expect(stalled.job.register()).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(REGISTER_LIMIT_MS);
      await failure;

      releaseUpsert();
      await vi.advanceTimersByTimeAsync(0);

      expect(stalled.jobsService.processor).toBeNull();
    });
  });

  it('closes connections and passes on the error when register fails outright', async () => {
    const failing = build(async () => {
      throw new Error('WRONGPASS');
    });

    await expect(failing.job.register()).rejects.toThrow('WRONGPASS');

    expect(failing.jobsService.closeQueue).toHaveBeenCalledOnce();
    expect(failing.jobsService.processor).toBeNull();
  });
});
