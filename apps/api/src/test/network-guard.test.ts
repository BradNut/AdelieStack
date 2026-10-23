import { request } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNoBlockedNetworkCalls, NETWORK_BLOCKED_MESSAGE, takeBlockedNetworkCalls } from './network-guard';

// Reserved names/addresses (RFC 2606 / RFC 5737) so nothing leaves the machine even if the guard is missing.
const URL_UNDER_TEST = 'https://hibp.example.invalid/range/ABCDE';

describe('unit-test network guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // These tests trip the guard on purpose; drain the record so the shared afterEach does not fail them.
    takeBlockedNetworkCalls();
  });

  it('fails a real fetch with a message naming the URL', async () => {
    await expect(fetch(URL_UNDER_TEST)).rejects.toThrow(`${NETWORK_BLOCKED_MESSAGE}: GET ${URL_UNDER_TEST}`);
  });

  it('names the method and URL when fetch is given a Request', async () => {
    await expect(fetch(new Request(URL_UNDER_TEST, { method: 'POST' }))).rejects.toThrow(`POST ${URL_UNDER_TEST}`);
  });

  it('fails a raw TCP connection made outside fetch, naming the host and port', () => {
    expect(() => connect({ host: '192.0.2.1', port: 6379 })).toThrow(`${NETWORK_BLOCKED_MESSAGE}: 192.0.2.1:6379`);
  });

  it('fails node:http requests, naming the host', () => {
    expect(() => request('http://api.example.invalid/v1').end()).toThrow('api.example.invalid:80');
  });

  it('still fails the test when the code under test swallows the error', async () => {
    await fetch(URL_UNDER_TEST).catch(() => undefined);
    try {
      connect({ host: '192.0.2.1', port: 6379 });
    } catch {
      // swallowed, as e.g. Better Auth's HIBP check or a client's reconnect loop would
    }

    expect(() => assertNoBlockedNetworkCalls()).toThrow(`${NETWORK_BLOCKED_MESSAGE}:\n  - GET ${URL_UNDER_TEST}\n  - 192.0.2.1:6379`);
  });

  it('clears the record once it has been reported', async () => {
    await fetch(URL_UNDER_TEST).catch(() => undefined);
    expect(() => assertNoBlockedNetworkCalls()).toThrow(URL_UNDER_TEST);

    expect(() => assertNoBlockedNetworkCalls()).not.toThrow();
  });

  it('still lets a test stub fetch on purpose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('stubbed')),
    );

    const res = await fetch(URL_UNDER_TEST);

    expect(await res.text()).toBe('stubbed');
    expect(takeBlockedNetworkCalls()).toEqual([]);
  });

  it('is back in place after a test unstubs fetch', async () => {
    await expect(fetch(URL_UNDER_TEST)).rejects.toThrow(NETWORK_BLOCKED_MESSAGE);
  });
});
