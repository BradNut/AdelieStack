import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthRateLimitStorage } from '#lib/server/api/auth/auth.rate-limit';
import { type ClientIpOptions, getClientIp } from '#lib/server/api/common/utils/ip';
import { createTestAuth } from '../../../../../test/auth-instance';

/** The rate-limit address of a request with no usable client address, in a test run, for both limiters. */
const NO_ADDRESS = '127.0.0.1';
const SIGN_IN_PATH = '/sign-in/email';
const TRUSTED_PROXIES = ['10.0.0.0/8', '192.0.2.10', '2001:db8:ffff::/48'];

/** The address our resolver reports for a real request carrying `value` in the client IP header. */
async function rateLimitMiddlewareAddress(options: ClientIpOptions, value: string): Promise<string> {
  const app = new Hono().get('/', (c) => c.text(getClientIp(c, options)));
  return (await app.request('/', { headers: { [AUTH_CLIENT_IP_HEADER]: value } })).text();
}

/** A real Better Auth instance, reporting the address its own limiter keyed each sign-in on. */
function betterAuthLimiter(options: ClientIpOptions) {
  const keys: string[] = [];
  const rateLimitStorage = {
    consume: async (key: string) => {
      keys.push(key);
      return { allowed: true, retryAfter: null };
    },
  } as unknown as AuthRateLimitStorage;
  const { request } = createTestAuth({ ...options, rateLimitStorage });

  return async (value: string): Promise<string | undefined> => {
    await request(SIGN_IN_PATH, {
      body: { email: 'penguin@example.com', password: 'not-the-password' },
      headers: { [AUTH_CLIENT_IP_HEADER]: value },
    });
    return keys.at(-1)?.split('|')[0];
  };
}

type Case = [label: string, header: string, expected: string];

const WITHOUT_TRUSTED_PROXIES: Case[] = [
  ['a single IPv4', '203.0.113.7', '203.0.113.7'],
  ['a chain', '198.51.100.66, 203.0.113.7', NO_ADDRESS],
  ['a chain of the same address', '203.0.113.7, 203.0.113.7', NO_ADDRESS],
  ['an invalid value', 'not-an-ip', NO_ADDRESS],
  ['an out-of-range IPv4', '256.1.1.1', NO_ADDRESS],
  ['a leading-zero IPv4', '01.2.3.4', NO_ADDRESS],
  ['an IP with a port', '203.0.113.7:8080', NO_ADDRESS],
  ['an empty value', '', NO_ADDRESS],
  ['only separators', ', ,', NO_ADDRESS],
  ['an empty value before an address', ', 203.0.113.7', '203.0.113.7'],
  ['an empty value after an address', '203.0.113.7,', '203.0.113.7'],
  ['an IPv6, kept to its /64', '2001:db8:1:2:3:4:5:6', '2001:0db8:0001:0002:0000:0000:0000:0000'],
  ['a compressed upper-case IPv6', '2001:DB8::1', '2001:0db8:0000:0000:0000:0000:0000:0000'],
  ['the IPv6 loopback', '::1', '0000:0000:0000:0000:0000:0000:0000:0000'],
  ['an IPv6 with a zone', 'fe80::1%eth0', NO_ADDRESS],
  ['a dotted IPv4-mapped IPv6', '::ffff:203.0.113.7', '203.0.113.7'],
  ['a hexadecimal IPv4-mapped IPv6', '::ffff:cb00:7107', '203.0.113.7'],
  ['a fully written IPv4-mapped IPv6', '0:0:0:0:0:ffff:cb00:7107', '203.0.113.7'],
  ['an upper-case hexadecimal IPv4-mapped IPv6', '::FFFF:CB00:7107', '0000:0000:0000:0000:0000:0000:0000:0000'],
];

const WITH_TRUSTED_PROXIES: Case[] = [
  ['a single client address', '203.0.113.7', '203.0.113.7'],
  ['a single trusted proxy', '10.0.0.1', NO_ADDRESS],
  ['a client behind one proxy', '203.0.113.7, 10.0.0.1', '203.0.113.7'],
  ['a client behind several proxies', '203.0.113.7, 192.0.2.10, 10.0.0.1', '203.0.113.7'],
  ['a spoofed leading address', '198.51.100.66, 203.0.113.7, 10.0.0.1', '203.0.113.7'],
  ['a spoofed trusted-looking leading address', '10.9.9.9, 203.0.113.7, 10.0.0.1', '203.0.113.7'],
  ['invalid text left of the client', 'not-an-ip, 203.0.113.7, 10.0.0.1', '203.0.113.7'],
  ['invalid text reached from the right', 'not-an-ip, 10.0.0.1', NO_ADDRESS],
  ['an invalid rightmost hop', '203.0.113.7, not-an-ip', NO_ADDRESS],
  ['only trusted proxies', '10.0.0.2, 10.0.0.1', NO_ADDRESS],
  ['an untrusted rightmost hop', '10.0.0.1, 198.51.100.66', '198.51.100.66'],
  ['just outside a declared range', '203.0.113.7, 11.0.0.1', '11.0.0.1'],
  ['an empty value', '', NO_ADDRESS],
  ['empty values between hops', '203.0.113.7, , 10.0.0.1', '203.0.113.7'],
  ['an IPv6 client behind an IPv6 proxy', '2001:db8:1::1, 2001:db8:ffff::1', '2001:0db8:0001:0000:0000:0000:0000:0000'],
  ['an IPv4 client behind an IPv6 proxy', '203.0.113.7, 2001:db8:ffff::1', '203.0.113.7'],
  ['an IPv6 client behind an IPv4 proxy', '2001:db8:1::1, 10.0.0.1', '2001:0db8:0001:0000:0000:0000:0000:0000'],
  ['a proxy written as IPv4-mapped IPv6', '203.0.113.7, ::ffff:10.0.0.1', '203.0.113.7'],
  ['a client written as IPv4-mapped IPv6', '::ffff:203.0.113.7, 10.0.0.1', '203.0.113.7'],
];

describe.each([
  { name: 'without trusted proxies', trustedProxies: [] as string[], cases: WITHOUT_TRUSTED_PROXIES },
  { name: 'with trusted proxies', trustedProxies: TRUSTED_PROXIES, cases: WITH_TRUSTED_PROXIES },
])('both limiters resolve the same client address $name', ({ trustedProxies, cases }) => {
  const options = { trustProxy: true, trustedProxies };
  let betterAuthAddress: ReturnType<typeof betterAuthLimiter>;

  beforeAll(() => {
    betterAuthAddress = betterAuthLimiter(options);
  });

  it.each(cases)('%s', async (_label, header, expected) => {
    expect(await betterAuthAddress(header)).toBe(expected);
    expect(await rateLimitMiddlewareAddress(options, header)).toBe(expected);
  });
});

const WITH_IPV6_SUBNET: Case[] = [
  ['an IPv6, kept to its /48', '2001:db8:1:2:3:4:5:6', '2001:0db8:0001:0000:0000:0000:0000:0000'],
  ['an IPv6 behind a proxy, kept to its /48', '2001:db8:1:2::1, 10.0.0.1', '2001:0db8:0001:0000:0000:0000:0000:0000'],
  ['an IPv4, unaffected', '203.0.113.7', '203.0.113.7'],
];

describe('both limiters key an IPv6 client on the same configured subnet', () => {
  const options = { trustProxy: true, trustedProxies: TRUSTED_PROXIES, ipv6Subnet: 48 };
  let betterAuthAddress: ReturnType<typeof betterAuthLimiter>;

  beforeAll(() => {
    betterAuthAddress = betterAuthLimiter(options);
  });

  it.each(WITH_IPV6_SUBNET)('%s', async (_label, header, expected) => {
    expect(await betterAuthAddress(header)).toBe(expected);
    expect(await rateLimitMiddlewareAddress(options, header)).toBe(expected);
  });
});

describe('both limiters with TRUST_PROXY off', () => {
  it.each([
    ['without trusted proxies', [] as string[]],
    ['with trusted proxies', TRUSTED_PROXIES],
  ])('read no client address from the header %s', async (_label, trustedProxies) => {
    const options = { trustProxy: false, trustedProxies };
    const header = '203.0.113.7';

    expect(await betterAuthLimiter(options)(header)).toBe(NO_ADDRESS);
    expect(await rateLimitMiddlewareAddress(options, header)).toBe(NO_ADDRESS);
  });
});
