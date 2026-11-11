import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '#lib/server/api/common/middleware/security-headers.middleware';

// Literal on purpose: a change to the policy should have to change this test too.
const EXPECTED_HSTS = 'max-age=31536000';

function appReturning(response: () => Response | Promise<Response>, options = { trustProxy: false }) {
  return new Hono().use(securityHeaders(options)).get('/', async () => response());
}

describe('securityHeaders middleware', () => {
  it('sets the headers on a response whose headers are immutable, like one passed straight through from fetch', async () => {
    // Redirect responses carry immutable headers, as fetch responses do; real fetches are blocked in API unit tests.
    const res = await appReturning(() => Response.redirect('https://elsewhere.example.com/', 302)).request('https://api.example.com/');

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toBe(EXPECTED_HSTS);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://elsewhere.example.com/');
  });

  it('removes an HSTS header a handler set when the client came over http', async () => {
    const upstream = () => new Response('ok', { headers: { 'strict-transport-security': EXPECTED_HSTS } });

    const res = await appReturning(upstream).request('http://api.example.com/');

    expect(res.headers.has('strict-transport-security')).toBe(false);
  });

  it('keeps cookies the handler set', async () => {
    const app = new Hono().use(securityHeaders({ trustProxy: false })).get('/', (c) => {
      c.header('set-cookie', 'a=1', { append: true });
      c.header('set-cookie', 'b=2', { append: true });
      return c.text('ok');
    });

    const res = await app.request('http://api.example.com/');

    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
  });
});
