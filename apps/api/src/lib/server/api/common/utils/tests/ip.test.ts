import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { IGNORED_CLIENT_IP_HEADERS } from '#lib/server/api/common/testing/client-ip';
import { getClientIp } from '#lib/server/api/common/utils/ip';

const SPOOFED_IP = '198.51.100.66';
const NO_PROXY_IP = '127.0.0.1';

/** The IP `getClientIp` resolves for a real Hono request carrying `headers`. */
async function resolveIp(trustProxy: boolean, headers: Record<string, string>): Promise<string> {
  const app = new Hono().get('/', (c) => c.text(getClientIp(c, trustProxy)));
  const response = await app.request('/', { headers });
  return response.text();
}

describe('getClientIp', () => {
  it.each(IGNORED_CLIENT_IP_HEADERS)('ignores a spoofed %s when the trusted header is absent', async (header) => {
    expect(await resolveIp(true, { [header]: SPOOFED_IP })).toBe(NO_PROXY_IP);
  });

  it.each([', 1.2.3.4', ' , 1.2.3.4', ','])('falls back when the first value of the trusted header %j is empty', async (value) => {
    expect(await resolveIp(true, { [AUTH_CLIENT_IP_HEADER]: value })).toBe(NO_PROXY_IP);
  });

  it('falls back when the trusted header is only whitespace', () => {
    // A real Request strips surrounding whitespace, so this needs the header value as given.
    const context = { req: { header: vi.fn().mockReturnValue('   ') } } as never;

    expect(getClientIp(context, true)).toBe(NO_PROXY_IP);
  });

  it('returns first forwarded IP when trust proxy is enabled', () => {
    const header = vi.fn().mockReturnValue('203.0.113.10, 70.41.3.18, 150.172.238.178');
    const context = { req: { header } } as never;

    const ip = getClientIp(context, true);

    expect(ip).toBe('203.0.113.10');
    expect(header).toHaveBeenCalledWith('x-forwarded-for');
  });

  it('returns 127.0.0.1 when trust proxy is enabled but header is missing', () => {
    const header = vi.fn().mockReturnValue(undefined);
    const context = { req: { header } } as never;

    const ip = getClientIp(context, true);

    expect(ip).toBe('127.0.0.1');
  });

  it('returns 127.0.0.1 and does not read forwarded header when trust proxy is disabled', () => {
    const header = vi.fn().mockReturnValue('203.0.113.10');
    const context = { req: { header } } as never;

    const ip = getClientIp(context, false);

    expect(ip).toBe('127.0.0.1');
    expect(header).not.toHaveBeenCalled();
  });
});
