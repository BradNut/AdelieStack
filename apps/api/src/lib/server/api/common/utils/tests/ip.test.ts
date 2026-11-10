import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { IGNORED_CLIENT_IP_HEADERS } from '#lib/server/api/common/testing/client-ip';
import { getClientIp, resolveClientAddress } from '#lib/server/api/common/utils/ip';

const SPOOFED_IP = '198.51.100.66';
const NO_PROXY_IP = '127.0.0.1';
const NO_TRUSTED_PROXIES: string[] = [];
const TRUST_NO_HOPS = { trustProxy: true, trustedProxies: NO_TRUSTED_PROXIES };
const TRUST_OFF = { trustProxy: false, trustedProxies: ['10.0.0.0/8'] };

/** The IP `getClientIp` resolves for a real Hono request carrying `headers`. */
async function resolveIp(headers: Record<string, string>, options = TRUST_NO_HOPS): Promise<string> {
  const app = new Hono().get('/', (c) => c.text(getClientIp(c, options)));
  const response = await app.request('/', { headers });
  return response.text();
}

const contextWithHeader = (value: string | undefined) => {
  const header = vi.fn().mockReturnValue(value);
  return { context: { req: { header } } as never, header };
};

describe('getClientIp', () => {
  it.each(IGNORED_CLIENT_IP_HEADERS)('ignores a spoofed %s when the trusted header is absent', async (header) => {
    expect(await resolveIp({ [header]: SPOOFED_IP })).toBe(NO_PROXY_IP);
  });

  it('reads the single address from the trusted header', () => {
    const { context, header } = contextWithHeader('203.0.113.10');

    expect(getClientIp(context, TRUST_NO_HOPS)).toBe('203.0.113.10');
    expect(header).toHaveBeenCalledWith('x-forwarded-for');
  });

  it.each([', 1.2.3.4', ' , 1.2.3.4'])('skips empty values in %j, as Better Auth does', async (value) => {
    expect(await resolveIp({ [AUTH_CLIENT_IP_HEADER]: value })).toBe('1.2.3.4');
  });

  it('falls back when the trusted header holds no value', async () => {
    expect(await resolveIp({ [AUTH_CLIENT_IP_HEADER]: ',' })).toBe(NO_PROXY_IP);
  });

  it('falls back when the trusted header is only whitespace', () => {
    // A real Request strips surrounding whitespace, so this needs the header value as given.
    expect(getClientIp(contextWithHeader('   ').context, TRUST_NO_HOPS)).toBe(NO_PROXY_IP);
  });

  it('does not take the leftmost address of a chain', () => {
    expect(getClientIp(contextWithHeader('203.0.113.10, 70.41.3.18').context, TRUST_NO_HOPS)).toBe(NO_PROXY_IP);
  });

  it('falls back when the trusted header is missing', () => {
    expect(getClientIp(contextWithHeader(undefined).context, TRUST_NO_HOPS)).toBe(NO_PROXY_IP);
  });

  it('reads no header when trust proxy is disabled, whatever is declared', () => {
    const { context, header } = contextWithHeader('203.0.113.10');

    expect(getClientIp(context, TRUST_OFF)).toBe(NO_PROXY_IP);
    expect(header).not.toHaveBeenCalled();
  });
});

describe('resolveClientAddress', () => {
  const trustedProxies = ['10.0.0.0/8', '2001:db8:ffff::/48'];

  it.each([
    ['a chain without trusted proxies', '203.0.113.10, 70.41.3.18', NO_TRUSTED_PROXIES],
    ['an invalid value', 'not-an-ip', NO_TRUSTED_PROXIES],
    ['an empty value', '', NO_TRUSTED_PROXIES],
    ['a chain of only trusted proxies', '10.0.0.2, 10.0.0.1', trustedProxies],
    ['an invalid hop reached from the right', 'not-an-ip, 10.0.0.1', trustedProxies],
  ])('resolves %s to no address', (_label, value, proxies) => {
    expect(resolveClientAddress(contextWithHeader(value).context, { trustProxy: true, trustedProxies: proxies })).toBeNull();
  });

  it('resolves a missing header to no address', () => {
    expect(resolveClientAddress(contextWithHeader(undefined).context, TRUST_NO_HOPS)).toBeNull();
  });

  it('resolves to no address with trust proxy off', () => {
    expect(resolveClientAddress(contextWithHeader('203.0.113.10').context, TRUST_OFF)).toBeNull();
  });

  it('strips the chain from the right to the first untrusted hop', () => {
    const value = `${SPOOFED_IP}, 203.0.113.10, 10.0.0.2, 10.0.0.1`;

    expect(resolveClientAddress(contextWithHeader(value).context, { trustProxy: true, trustedProxies })).toBe('203.0.113.10');
  });

  it('stops at an untrusted rightmost hop, the closest address a proxy vouches for', () => {
    const value = '10.0.0.5, 203.0.113.10';

    expect(resolveClientAddress(contextWithHeader(value).context, { trustProxy: true, trustedProxies })).toBe('203.0.113.10');
  });
});
