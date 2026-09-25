import { vi } from 'vitest';

/** Silent stand-in for `LoggerService` so tests never write through pino. */
export function createLoggerServiceMock() {
  return {
    log: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
}

export type LoggerServiceMock = ReturnType<typeof createLoggerServiceMock>;
