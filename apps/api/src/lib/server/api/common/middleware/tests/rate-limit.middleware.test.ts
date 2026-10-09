import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectRateLimitBypassed, getNoSessionRateLimitOptions } from './rate-limit-test.helpers';
import { rateLimitTestMocks } from './rate-limit-test.mocks';
import './rate-limit-test.setup';

const { getClientIpMock } = vi.hoisted(() => ({
  getClientIpMock: vi.fn(),
}));

vi.mock('../../utils/ip', () => ({
  getClientIp: getClientIpMock,
}));

import { rateLimit } from '../rate-limit.middleware';

describe('rate-limit.middleware', () => {
  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    getClientIpMock.mockReturnValue('127.0.0.1');
  });

  it('bypasses limiter when DISABLE_RATE_LIMIT is enabled', async () => {
    await expectRateLimitBypassed(() => rateLimit({ limit: 10, minutes: 1 }));
  });

  it('uses session userId as key when available', async () => {
    rateLimit({ limit: 10, minutes: 15, key: 'login' });

    const options = rateLimitTestMocks.rateLimiterMock.mock.calls[0][0] as {
      keyGenerator: (ctx: { var: { session: { userId: string } | null }; req: { path: string } }) => string;
      store: { config: { client: { decr: (key: string) => Promise<number> } } };
      windowMs: number;
      limit: number;
    };

    const key = options.keyGenerator({
      var: { session: { userId: 'user-1' } },
      req: { path: '/api/auth' },
    });

    expect(key).toBe('user-1_login');
    expect(getClientIpMock).not.toHaveBeenCalled();
    expect(options.windowMs).toBe(900000);
    expect(options.limit).toBe(10);

    await options.store.config.client.decr('foo');
    expect(rateLimitTestMocks.callMock).toHaveBeenCalledWith('DECR', 'foo');
  });

  it('falls back to client IP and request path when no session exists', () => {
    const options = getNoSessionRateLimitOptions(() => rateLimit({ limit: 3, minutes: 1 }));

    const key = options.keyGenerator({
      var: { session: null },
      req: { path: '/api/resource' },
    });

    expect(getClientIpMock).toHaveBeenCalled();
    expect(key).toBe('127.0.0.1_/api/resource');
  });

  it('propagates errors from getClientIp', () => {
    getClientIpMock.mockImplementation(() => {
      throw new Error('ip failure');
    });

    const options = getNoSessionRateLimitOptions(() => rateLimit({ limit: 3, minutes: 1 }));

    expect(() =>
      options.keyGenerator({
        var: { session: null },
        req: { path: '/api/resource' },
      }),
    ).toThrow('ip failure');
  });
});
