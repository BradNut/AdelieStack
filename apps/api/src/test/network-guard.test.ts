import { request } from 'node:http';
import { connect } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { NETWORK_BLOCKED_MESSAGE } from './network-guard';

// Reserved names/addresses (RFC 2606 / RFC 5737) so nothing leaves the machine even if the guard is missing.
const URL_UNDER_TEST = 'https://hibp.example.invalid/range/ABCDE';

describe('unit-test network guard', () => {
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

  it('still lets a test stub fetch on purpose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('stubbed')),
    );

    const res = await fetch(URL_UNDER_TEST);

    expect(await res.text()).toBe('stubbed');
    vi.unstubAllGlobals();
  });

  it('is back in place after a test unstubs fetch', async () => {
    await expect(fetch(URL_UNDER_TEST)).rejects.toThrow(NETWORK_BLOCKED_MESSAGE);
  });
});
