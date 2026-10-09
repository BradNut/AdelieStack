import type { Mock } from 'vitest';
import { vi } from 'vitest';

type RateLimitContainerMocks = {
  callMock: Mock;
  disableRateLimitMock: { value: boolean };
};

const callMock = vi.fn();
const rateLimiterMock = vi.fn();
const disableRateLimitMock = { value: false };

function resetRateLimitMocks() {
  vi.clearAllMocks();
  disableRateLimitMock.value = false;
  rateLimiterMock.mockReturnValue('middleware');
}

const RedisStoreMock = class {
  constructor(public config: { client: unknown }) {}
};

function createRateLimitContainerClass(mocks: RateLimitContainerMocks) {
  return class {
    get(token: { name?: string }) {
      if (token?.name?.includes('RedisService')) {
        return { redis: { call: mocks.callMock } };
      }

      if (token?.name?.includes('ConfigService')) {
        return {
          envs: {
            get DISABLE_RATE_LIMIT() {
              return mocks.disableRateLimitMock.value;
            },
          },
        };
      }

      return undefined;
    }
  };
}

function createHonoRateLimiterMock() {
  return {
    rateLimiter: rateLimiterMock,
    RedisStore: RedisStoreMock,
  };
}

async function createNeedleDiMock(importOriginal: <T>() => Promise<T>) {
  const actual = await importOriginal<typeof import('@needle-di/core')>();
  return {
    ...actual,
    Container: createRateLimitContainerClass({ callMock, disableRateLimitMock }),
  };
}

export const rateLimitTestMocks = {
  callMock,
  rateLimiterMock,
  disableRateLimitMock,
  resetRateLimitMocks,
  createHonoRateLimiterMock,
  createNeedleDiMock,
};
