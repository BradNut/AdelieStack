import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { createTestContainer, mockProvider } from '../../common/testing/test-container';
import { JobsService } from '../jobs.service';

/**
 * Mock BullMQ so no Redis socket is opened. The constructors record their
 * arguments, letting us assert the connection config without a live broker.
 */
const queueCtor = vi.fn();
const workerCtor = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, opts: unknown) {
      queueCtor(name, opts);
    }
  },
  Worker: class {
    constructor(name: string, processor: unknown, opts: unknown) {
      workerCtor(name, processor, opts);
    }
  },
}));

const REDIS_URL = 'redis://localhost:6379';

function build() {
  const container = createTestContainer(mockProvider(ConfigService, { envs: { REDIS_URL } }));
  return container.get(JobsService);
}

describe('JobsService', () => {
  beforeEach(() => {
    queueCtor.mockClear();
    workerCtor.mockClear();
  });

  it('opens no connection at construction (lazy)', () => {
    build();
    expect(queueCtor).not.toHaveBeenCalled();
    expect(workerCtor).not.toHaveBeenCalled();
  });

  it('creates a queue bound to the configured Redis url only when asked', () => {
    const service = build();

    expect(queueCtor).not.toHaveBeenCalled();
    service.createQueue('demo');

    expect(queueCtor).toHaveBeenCalledTimes(1);
    expect(queueCtor).toHaveBeenCalledWith('demo', { connection: { url: REDIS_URL } });
  });

  it('creates a worker bound to the configured Redis url', () => {
    const service = build();
    const processor = vi.fn();

    service.createWorker('demo', processor);

    expect(workerCtor).toHaveBeenCalledTimes(1);
    const [name, passedProcessor, opts] = workerCtor.mock.calls[0];
    expect(name).toBe('demo');
    expect(passedProcessor).toBe(processor);
    expect(opts).toMatchObject({ connection: { url: REDIS_URL } });
  });
});
