import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: { ADDRESS_HEADER: undefined as string | undefined },
}));

vi.mock('$app/env/private', () => ({
  get ADDRESS_HEADER() {
    return envMock.ADDRESS_HEADER;
  },
}));

/** Importing afresh gives each test what a new process would start with. */
async function freshWarningCheck() {
  vi.resetModules();
  const { warnIfClientAddressUnconfigured } = await import('../client-address-warning');
  return (headers: Record<string, string>) => warnIfClientAddressUnconfigured(new Headers(headers));
}

describe('warnIfClientAddressUnconfigured', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    envMock.ADDRESS_HEADER = undefined;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it.each([
    [AUTH_CLIENT_IP_HEADER, '203.0.113.7'],
    ['x-real-ip', '203.0.113.7'],
    ['cf-connecting-ip', '203.0.113.7'],
  ])('warns naming ADDRESS_HEADER and %s when that header arrives and it is unset', async (header, value) => {
    const check = await freshWarningCheck();

    check({ [header]: value });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('ADDRESS_HEADER');
    expect(warn.mock.calls[0][0]).toContain(header);
  });

  it('does not warn for a Forwarded-only proxy, because adapter-node cannot read that header', async () => {
    const check = await freshWarningCheck();

    check({ forwarded: 'for=203.0.113.7' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns at most once per process, however many requests or headers arrive', async () => {
    const check = await freshWarningCheck();

    check({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.7' });
    check({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.8' });
    check({ 'x-real-ip': '203.0.113.9' });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never writes the client-supplied header value to the log', async () => {
    const check = await freshWarningCheck();

    check({ [AUTH_CLIENT_IP_HEADER]: 'attacker-controlled' });

    expect(String(warn.mock.calls[0][0])).not.toContain('attacker-controlled');
  });

  it('does not warn when ADDRESS_HEADER is set', async () => {
    envMock.ADDRESS_HEADER = AUTH_CLIENT_IP_HEADER;
    const check = await freshWarningCheck();

    check({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.7' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when the request has no forwarding headers', async () => {
    const check = await freshWarningCheck();

    check({ accept: 'text/html', 'user-agent': 'curl/8' });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a later forwarded request after an earlier direct one', async () => {
    const check = await freshWarningCheck();

    check({});
    check({ [AUTH_CLIENT_IP_HEADER]: '203.0.113.7' });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
