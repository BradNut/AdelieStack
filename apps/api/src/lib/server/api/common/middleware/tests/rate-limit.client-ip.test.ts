import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IGNORED_CLIENT_IP_HEADERS } from '#lib/server/api/common/testing/client-ip';
import { MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS } from '#lib/server/api/common/utils/client-address-warning';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { getRateLimitOptions } from './rate-limit-test.helpers';
import { rateLimitTestMocks } from './rate-limit-test.mocks';
import './rate-limit-test.setup';

import { rateLimit } from '#lib/server/api/common/middleware/rate-limit.middleware';

const PATH = '/resource';
const SHARED_BUCKET_KEY = `127.0.0.1_${PATH}`;
const SPOOFED_IP = '198.51.100.66';

/** The rate-limit key the middleware builds for a real anonymous request carrying `headers`. */
async function rateLimitKey(headers: Record<string, string>): Promise<string> {
  const { keyGenerator } = getRateLimitOptions<Context<HonoEnv>>(() => rateLimit({ limit: 3, minutes: 1 }));

  const app = new Hono<HonoEnv>().get(PATH, (c) => c.text(keyGenerator(c)));
  const response = await app.request(PATH, { headers });
  return response.text();
}

describe('rate-limit key client IP', () => {
  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
  });

  describe('with TRUST_PROXY on', () => {
    beforeEach(() => {
      rateLimitTestMocks.trustProxyMock.value = true;
    });

    it('gives clients with different X-Forwarded-For values their own buckets', async () => {
      expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' })).toBe(`203.0.113.1_${PATH}`);
      expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.2' })).toBe(`203.0.113.2_${PATH}`);
    });

    it('does not let spoofed fallback headers change the bucket of a proxied client', async () => {
      const key = await rateLimitKey({
        [AUTH_CLIENT_IP_HEADER]: '203.0.113.1',
        'x-real-ip': SPOOFED_IP,
        'cf-connecting-ip': '198.51.100.67',
      });

      expect(key).toBe(`203.0.113.1_${PATH}`);
    });

    it.each(IGNORED_CLIENT_IP_HEADERS)('does not let %s choose a bucket when X-Forwarded-For is absent', async (header) => {
      expect(await rateLimitKey({ [header]: SPOOFED_IP })).toBe(SHARED_BUCKET_KEY);
    });

    it('does not take the leftmost address of a chain when no trusted proxy is declared', async () => {
      expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: `${SPOOFED_IP}, 203.0.113.1` })).toBe(SHARED_BUCKET_KEY);
    });

    describe('behind a declared trusted proxy', () => {
      beforeEach(() => {
        rateLimitTestMocks.trustedProxiesMock.value = ['10.0.0.0/8'];
      });

      it('keys on the address the proxy saw', async () => {
        expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1, 10.0.0.1' })).toBe(`203.0.113.1_${PATH}`);
      });

      it.each([SPOOFED_IP, '198.51.100.67', 'not-an-ip'])('does not let a client-supplied leading %s change the bucket', async (spoofed) => {
        expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: `${spoofed}, 203.0.113.1, 10.0.0.1` })).toBe(`203.0.113.1_${PATH}`);
      });
    });
  });

  it('reads no IP header with TRUST_PROXY off, even with trusted proxies declared', async () => {
    rateLimitTestMocks.trustedProxiesMock.value = ['10.0.0.0/8'];
    const key = await rateLimitKey({
      [AUTH_CLIENT_IP_HEADER]: '203.0.113.1',
      'x-real-ip': SPOOFED_IP,
      'cf-connecting-ip': '198.51.100.67',
    });

    expect(key).toBe(SHARED_BUCKET_KEY);
  });
});

describe('rate-limit warning for a missing client address', () => {
  // Past any warning the tests above logged on the real clock.
  let clock = Date.now() + 2 * MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS;

  beforeEach(() => {
    rateLimitTestMocks.resetRateLimitMocks();
    rateLimitTestMocks.trustProxyMock.value = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    // The throttle lives for the process, so each test starts one full interval after the last.
    clock += MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS;
    vi.setSystemTime(clock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns and still keys the request on the shared bucket', async () => {
    expect(await rateLimitKey({})).toBe(SHARED_BUCKET_KEY);

    expect(rateLimitTestMocks.warnMock).toHaveBeenCalledOnce();
    expect(rateLimitTestMocks.warnMock.mock.calls[0][0]).toContain(AUTH_CLIENT_IP_HEADER);
  });

  it('does not warn for a usable address, and keys on it', async () => {
    expect(await rateLimitKey({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' })).toBe(`203.0.113.1_${PATH}`);

    expect(rateLimitTestMocks.warnMock).not.toHaveBeenCalled();
  });

  it('does not warn for a signed-in request, whose bucket is its own', async () => {
    const { keyGenerator } = getRateLimitOptions<Context<HonoEnv>>(() => rateLimit({ limit: 3, minutes: 1 }));
    const context = { var: { session: { userId: 'user-1' } }, req: { path: PATH, header: () => undefined } } as unknown as Context<HonoEnv>;

    expect(keyGenerator(context)).toBe(`user-1_${PATH}`);
    expect(rateLimitTestMocks.warnMock).not.toHaveBeenCalled();
  });

  it('does not warn with TRUST_PROXY off', async () => {
    rateLimitTestMocks.trustProxyMock.value = false;

    expect(await rateLimitKey({})).toBe(SHARED_BUCKET_KEY);
    expect(rateLimitTestMocks.warnMock).not.toHaveBeenCalled();
  });
});
