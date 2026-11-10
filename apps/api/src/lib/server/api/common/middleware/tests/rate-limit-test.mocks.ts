import type { Mock } from 'vitest';
import { vi } from 'vitest';

type RateLimitContainerMocks = {
  callMock: Mock;
  disableRateLimitMock: { value: boolean };
  trustProxyMock: { value: boolean };
  trustedProxiesMock: { value: string[] };
};

const callMock = vi.fn();
const rateLimiterMock = vi.fn();
const disableRateLimitMock = { value: false };
const trustProxyMock = { value: false };
const trustedProxiesMock: { value: string[] } = { value: [] };

function resetRateLimitMocks() {
  vi.clearAllMocks();
  disableRateLimitMock.value = false;
  trustProxyMock.value = false;
  trustedProxiesMock.value = [];
  rateLimiterMock.mockReturnValue('middleware');
}

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
            get TRUST_PROXY() {
              return mocks.trustProxyMock.value;
            },
            get TRUSTED_PROXIES() {
              return mocks.trustedProxiesMock.value;
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
  };
}

async function createNeedleDiMock(importOriginal: <T>() => Promise<T>) {
  const actual = await importOriginal<typeof import('@needle-di/core')>();
  return {
    ...actual,
    Container: createRateLimitContainerClass({ callMock, disableRateLimitMock, trustProxyMock, trustedProxiesMock }),
  };
}

export const rateLimitTestMocks = {
  callMock,
  rateLimiterMock,
  disableRateLimitMock,
  trustProxyMock,
  trustedProxiesMock,
  resetRateLimitMocks,
  createHonoRateLimiterMock,
  createNeedleDiMock,
};
