import type { Context } from 'hono';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { rateLimitTestMocks } from './rate-limit-test.mocks';
import './rate-limit-test.setup';

import { rateLimit } from '#lib/server/api/common/middleware/rate-limit.middleware';

const PATH = '/resource';
const SHARED_BUCKET_KEY = `127.0.0.1_${PATH}`;

/** The rate-limit key the middleware builds for a real anonymous request carrying `headers`. */
async function rateLimitKey(headers: Record<string, string>): Promise<string> {
  rateLimit({ limit: 3, minutes: 1 });
  const { keyGenerator } = rateLimitTestMocks.rateLimiterMock.mock.calls[0][0] as { keyGenerator: (c: Context<HonoEnv>) => string };

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
      expect(await rateLimitKey({ 'x-forwarded-for': '203.0.113.1' })).toBe(`203.0.113.1_${PATH}`);
      expect(await rateLimitKey({ 'x-forwarded-for': '203.0.113.2' })).toBe(`203.0.113.2_${PATH}`);
    });

    it('does not let spoofed fallback headers change the bucket of a proxied client', async () => {
      const key = await rateLimitKey({
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '198.51.100.66',
        'cf-connecting-ip': '198.51.100.67',
      });

      expect(key).toBe(`203.0.113.1_${PATH}`);
    });

    it.each(['x-real-ip', 'cf-connecting-ip'])('does not let %s choose a bucket when X-Forwarded-For is absent', async (header) => {
      expect(await rateLimitKey({ [header]: '198.51.100.66' })).toBe(SHARED_BUCKET_KEY);
    });
  });

  it('reads no IP header with TRUST_PROXY off', async () => {
    const key = await rateLimitKey({
      'x-forwarded-for': '203.0.113.1',
      'x-real-ip': '198.51.100.66',
      'cf-connecting-ip': '198.51.100.67',
    });

    expect(key).toBe(SHARED_BUCKET_KEY);
  });
});
