import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS, warnIfClientAddressMissing } from '#lib/server/api/common/utils/client-address-warning';
import type { ClientIpOptions } from '#lib/server/api/common/utils/ip';

const TRUSTING: ClientIpOptions = { trustProxy: true, trustedProxies: [] };
const CLIENT_SUPPLIED = '198.51.100.66-attacker-controlled';

let clock = Date.UTC(2026, 0, 1);

describe('warnIfClientAddressMissing', () => {
  const warn = vi.fn();
  const getLog = vi.fn(() => ({ warn }));

  async function send(headers: Record<string, string>, options = TRUSTING) {
    const app = new Hono().get('/', (c) => {
      warnIfClientAddressMissing(c, options, getLog);
      return c.text('ok');
    });
    await app.request('/', { headers });
  }

  const advance = (milliseconds: number) => {
    clock += milliseconds;
    vi.setSystemTime(clock);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // The throttle lives for the process, so each test starts one full interval after the last.
    advance(MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS);
    warn.mockClear();
    getLog.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the expected header when the header is absent', async () => {
    await send({});

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(AUTH_CLIENT_IP_HEADER);
  });

  it.each([
    ['only X-Real-IP', { 'x-real-ip': '203.0.113.1' }],
    ['only CF-Connecting-IP', { 'cf-connecting-ip': '203.0.113.1' }],
    ['a chain with no trusted proxy', { [AUTH_CLIENT_IP_HEADER]: '203.0.113.1, 198.51.100.1' }],
    ['an invalid value', { [AUTH_CLIENT_IP_HEADER]: 'not-an-ip' }],
    ['an empty value', { [AUTH_CLIENT_IP_HEADER]: '' }],
  ])('warns for %s', async (_label, headers) => {
    await send(headers);

    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns for a chain of only trusted proxies', async () => {
    await send({ [AUTH_CLIENT_IP_HEADER]: '10.0.0.2, 10.0.0.1' }, { trustProxy: true, trustedProxies: ['10.0.0.0/8'] });

    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns at most once per interval under sustained traffic', async () => {
    for (let i = 0; i < 25; i++) await send({});

    expect(warn).toHaveBeenCalledOnce();
  });

  it('stays quiet until the full interval has passed', async () => {
    await send({});
    advance(MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS - 1);
    await send({});

    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns again once the interval has passed', async () => {
    await send({});
    advance(MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS);
    await send({});

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the client IP header', { [AUTH_CLIENT_IP_HEADER]: CLIENT_SUPPLIED }],
    ['a chain', { [AUTH_CLIENT_IP_HEADER]: `${CLIENT_SUPPLIED}, ${CLIENT_SUPPLIED}` }],
    ['another forwarding header', { 'x-real-ip': CLIENT_SUPPLIED }],
  ])('never logs a value from %s', async (_label, headers) => {
    await send(headers);

    expect(JSON.stringify(warn.mock.calls)).not.toContain(CLIENT_SUPPLIED);
  });

  it('does not warn with TRUST_PROXY off, and reads no header', async () => {
    const header = vi.fn();

    warnIfClientAddressMissing({ req: { header } } as never, { trustProxy: false, trustedProxies: [] }, getLog);

    expect(warn).not.toHaveBeenCalled();
    expect(header).not.toHaveBeenCalled();
  });

  it('does not warn for a usable address', async () => {
    await send({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when a declared proxy leaves a client address', async () => {
    await send({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1, 10.0.0.1' }, { trustProxy: true, trustedProxies: ['10.0.0.0/8'] });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not count a usable request towards the throttle', async () => {
    await send({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' });
    await send({});

    expect(warn).toHaveBeenCalledOnce();
  });

  it('builds no logger when there is nothing to report', async () => {
    await send({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.1' });

    expect(getLog).not.toHaveBeenCalled();
  });
});
