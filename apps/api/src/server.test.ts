import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Boots the real `server.ts`: the DI container, startup, routes and shutdown all run for real. Only the process and
 * network edges are replaced. Every double records into `boot.events`, so a test can assert what happened and in what order.
 */
const boot = vi.hoisted(() => {
  interface S3Command {
    constructor: { name: string };
    input: { Bucket?: string };
  }

  const state = {
    events: [] as string[],
    s3Commands: [] as Array<{ command: string; bucket?: string }>,
    /** Answers every S3 request. The default says each bucket exists. */
    s3Send: async (_command: S3Command): Promise<unknown> => ({}),
    upsertJobScheduler: async (): Promise<unknown> => ({}),
    closeHttp: (done: (error?: Error) => void) => done(),
    closeWorker: async (): Promise<void> => {},
    flushTelemetry: async (): Promise<void> => {},
  };

  /** Finishes on a later tick, so a step that was not awaited records out of order. */
  const later = () => new Promise<void>((resolve) => setImmediate(resolve));

  class FakeS3Client {
    send(command: S3Command) {
      state.s3Commands.push({ command: command.constructor.name, bucket: command.input.Bucket });
      return state.s3Send(command);
    }
  }

  class FakeQueue {
    async upsertJobScheduler() {
      const result = await state.upsertJobScheduler();
      state.events.push('job scheduled');
      return result;
    }
    async close() {
      await later();
      state.events.push('jobs closed');
    }
  }

  class FakeWorker {
    constructor() {
      state.events.push('worker started');
    }
    async close() {
      await state.closeWorker();
      await later();
      state.events.push('jobs closed');
    }
  }

  return { state, later, FakeS3Client, FakeQueue, FakeWorker };
});

const serve = vi.hoisted(() => vi.fn());

vi.mock('varlock/auto-load', () => ({}));
vi.mock('./instrument.mjs', () => ({
  flushTelemetry: async () => {
    await boot.state.flushTelemetry();
    await boot.later();
    boot.state.events.push('telemetry flushed');
  },
}));
vi.mock('@hono/node-server', () => ({ serve }));
vi.mock('bullmq', () => ({ Queue: boot.FakeQueue, Worker: boot.FakeWorker }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: boot.FakeS3Client,
}));

/** Written out rather than imported, so a changed limit fails here. */
const SHUTDOWN_LIMIT_MS = 8_000;
const SIGNALS = ['SIGINT', 'SIGTERM'] as const;
type Signal = (typeof SIGNALS)[number];

const PUBLIC_BUCKET = 'adelie-public-development';
const PRIVATE_BUCKET = 'adelie-private-development';

/** The defaults a deployment gets from `.env.schema`, plus the secrets it leaves for the platform to supply. */
function stubDeploymentEnv({ jobsEnabled }: { jobsEnabled: boolean }) {
  const schema = readFileSync(new URL('../.env.schema', import.meta.url), 'utf8');
  for (const [, key, value] of schema.matchAll(/^([A-Z][A-Z0-9_]*)=(.+)$/gm)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv('SIGNING_SECRET', 'test-signing-secret');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-better-auth-secret-of-32-chars-min');
  vi.stubEnv('JOBS_ENABLED', String(jobsEnabled));
  // The rate limiter's Redis store loads its scripts as soon as a limited route is built, which the network guard rightly blocks.
  vi.stubEnv('DISABLE_RATE_LIMIT', 'true');
}

let signalHandlers: Record<Signal, NodeJS.SignalsListener[]>;
let exit: ReturnType<typeof vi.spyOn>;

/** Imports the real entry point, keeping the signal handlers it installs so a test can deliver them without signalling the test runner. */
async function bootServer() {
  vi.resetModules();
  const before = Object.fromEntries(SIGNALS.map((signal) => [signal, process.listeners(signal)])) as Record<Signal, NodeJS.SignalsListener[]>;
  const { ApplicationController } = await import('#lib/server/api/application.controller');
  const registerControllers = vi.spyOn(ApplicationController.prototype, 'registerControllers');

  try {
    await import('./server');
  } finally {
    signalHandlers = Object.fromEntries(
      SIGNALS.map((signal) => [signal, process.listeners(signal).filter((listener) => !before[signal].includes(listener))]),
    ) as typeof signalHandlers;
  }

  return { registerControllers };
}

const deliver = (signal: Signal) => {
  for (const handler of signalHandlers[signal]) handler(signal);
};

/** What the fake `serve` was given. */
const servedFetch = () => serve.mock.calls[0][0].fetch as (request: Request) => Promise<Response>;

const logged = (spy: unknown) => (spy as { mock: { calls: unknown[][] } }).mock.calls.flat().join('\n');

beforeEach(() => {
  signalHandlers = { SIGINT: [], SIGTERM: [] };
  Object.assign(boot.state, {
    events: [],
    s3Commands: [],
    s3Send: async () => ({}),
    upsertJobScheduler: async () => ({}),
    closeHttp: (done: (error?: Error) => void) => {
      boot.later().then(() => {
        boot.state.events.push('http closed');
        done();
      });
    },
    closeWorker: async () => {},
    flushTelemetry: async () => {},
  });
  serve.mockImplementation(() => {
    boot.state.events.push('serving');
    return { close: (done: (error?: Error) => void) => boot.state.closeHttp(done) };
  });
  exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    boot.state.events.push(`exit ${code}`);
  }) as typeof process.exit);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  for (const signal of SIGNALS) {
    for (const handler of signalHandlers[signal]) process.removeListener(signal, handler);
  }
});

describe('server boot', () => {
  it('finishes startup before it starts serving', async () => {
    stubDeploymentEnv({ jobsEnabled: true });

    await bootServer();

    expect(boot.state.events).toEqual(['job scheduled', 'worker started', 'serving']);
    expect(boot.state.s3Commands).not.toHaveLength(0);
  });

  it('checks both buckets when they already exist', async () => {
    stubDeploymentEnv({ jobsEnabled: false });

    await bootServer();

    expect(boot.state.s3Commands).toEqual(
      expect.arrayContaining([
        { command: 'HeadBucketCommand', bucket: PUBLIC_BUCKET },
        { command: 'HeadBucketCommand', bucket: PRIVATE_BUCKET },
      ]),
    );
    expect(boot.state.s3Commands.some(({ command }) => command === 'CreateBucketCommand')).toBe(false);
  });

  it('creates the buckets that are missing', async () => {
    stubDeploymentEnv({ jobsEnabled: false });
    boot.state.s3Send = async (command) => {
      if (command.constructor.name === 'HeadBucketCommand') throw Object.assign(new Error('missing'), { name: 'NotFound' });
      return {};
    };

    await bootServer();

    expect(boot.state.s3Commands).toEqual(
      expect.arrayContaining([
        { command: 'CreateBucketCommand', bucket: PUBLIC_BUCKET },
        { command: 'CreateBucketCommand', bucket: PRIVATE_BUCKET },
      ]),
    );
  });

  it('registers routes once and serves them', async () => {
    stubDeploymentEnv({ jobsEnabled: false });

    const { registerControllers } = await bootServer();

    expect(registerControllers).toHaveBeenCalledOnce();
    expect(serve).toHaveBeenCalledOnce();
    const response = await servedFetch()(new Request('http://localhost/api/healthz'));
    expect(response.status).toBe(200);
  });

  it('registers background jobs when JOBS_ENABLED is true', async () => {
    stubDeploymentEnv({ jobsEnabled: true });

    await bootServer();

    expect(boot.state.events).toContain('job scheduled');
    expect(boot.state.events).toContain('worker started');
  });

  it('registers no background jobs when JOBS_ENABLED is false', async () => {
    stubDeploymentEnv({ jobsEnabled: false });

    await bootServer();

    expect(boot.state.events).toEqual(['serving']);
  });

  it('never serves when storage is unreachable', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    boot.state.s3Send = async () => {
      throw new Error('connect ECONNREFUSED storage');
    };

    await expect(bootServer()).rejects.toThrow('ECONNREFUSED');

    expect(serve).not.toHaveBeenCalled();
    expect(boot.state.events).not.toContain('job scheduled');
  });

  it('never serves when job registration fails', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    boot.state.upsertJobScheduler = async () => {
      throw new Error('WRONGPASS');
    };

    await expect(bootServer()).rejects.toThrow('WRONGPASS');

    expect(serve).not.toHaveBeenCalled();
    expect(boot.state.events).toContain('jobs closed');
  });
});

describe('server shutdown', () => {
  const EXPECTED_SEQUENCE = ['http closed', 'jobs closed', 'jobs closed', 'telemetry flushed', 'exit 0'];

  /** The events recorded since the server started. */
  const shutdownEvents = () => boot.state.events.slice(boot.state.events.indexOf('serving') + 1);

  it.each(SIGNALS)('on %s closes HTTP, then jobs, then flushes telemetry, then exits 0', async (signal) => {
    stubDeploymentEnv({ jobsEnabled: true });
    await bootServer();

    deliver(signal);

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(shutdownEvents()).toEqual(EXPECTED_SEQUENCE);
    expect(logged(console.log)).toContain('Shutting down...');
  });

  it('still shuts down cleanly when jobs are disabled', async () => {
    stubDeploymentEnv({ jobsEnabled: false });
    await bootServer();

    deliver('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(shutdownEvents()).toEqual(['http closed', 'telemetry flushed', 'exit 0']);
  });

  it('ignores repeat signals while shutting down', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    await bootServer();

    deliver('SIGTERM');
    deliver('SIGTERM');
    deliver('SIGINT');

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    await boot.later();
    expect(exit).toHaveBeenCalledOnce();
    expect(shutdownEvents()).toEqual(EXPECTED_SEQUENCE);
  });

  it('logs a failed step, still runs the later steps, and exits 1', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    await bootServer();
    boot.state.closeHttp = (done) => done(new Error('close failed'));

    deliver('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(shutdownEvents()).toEqual(['jobs closed', 'jobs closed', 'telemetry flushed', 'exit 1']);
    expect(logged(console.error)).toContain('close HTTP');
  });

  it('runs the remaining steps when telemetry is the step that fails', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    await bootServer();
    boot.state.flushTelemetry = async () => {
      throw new Error('collector down');
    };

    deliver('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(exit).toHaveBeenCalledWith(1);
    expect(logged(console.error)).toContain('flush telemetry');
  });

  it('exits 1 at the limit when a step stalls, naming what did not finish', async () => {
    stubDeploymentEnv({ jobsEnabled: true });
    await bootServer();
    vi.useFakeTimers();
    boot.state.closeWorker = () => new Promise(() => {});

    deliver('SIGTERM');

    await vi.advanceTimersByTimeAsync(SHUTDOWN_LIMIT_MS - 1);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(boot.state.events).toContain('http closed');
    expect(boot.state.events).not.toContain('telemetry flushed');
    const errors = logged(console.error);
    expect(errors).toContain('close jobs');
    expect(errors).toContain('flush telemetry');
    expect(errors).not.toContain('close HTTP');
  });
});
