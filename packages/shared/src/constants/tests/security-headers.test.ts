import { describe, expect, it } from 'vitest';
import { withSecurityHeaders } from '../security-headers';

// Literal on purpose: a change to the policy should have to change this test too.
const EXPECTED_BASELINE = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=()',
};
const EXPECTED_HSTS = 'max-age=31536000';

function expectBaseline(response: Response) {
  for (const [name, value] of Object.entries(EXPECTED_BASELINE)) {
    expect(response.headers.get(name)).toBe(value);
  }
}

describe('withSecurityHeaders', () => {
  it('sets the baseline and HSTS over https', () => {
    const response = withSecurityHeaders(new Response('ok'), { overHttps: true });

    expectBaseline(response);
    expect(response.headers.get('strict-transport-security')).toBe(EXPECTED_HSTS);
  });

  it('sets the baseline but no HSTS over http', () => {
    const response = withSecurityHeaders(new Response('ok'), { overHttps: false });

    expectBaseline(response);
    expect(response.headers.has('strict-transport-security')).toBe(false);
  });

  it('removes an HSTS header already present over http', () => {
    const upstream = new Response('ok', { headers: { 'strict-transport-security': EXPECTED_HSTS } });

    const response = withSecurityHeaders(upstream, { overHttps: false });

    expect(response.headers.has('strict-transport-security')).toBe(false);
  });

  it('returns the same response when its headers can be changed', () => {
    const response = new Response('ok');

    expect(withSecurityHeaders(response, { overHttps: true })).toBe(response);
  });

  it('copies a response whose headers are immutable, keeping status, headers and body', async () => {
    const immutable = await fetch('data:text/plain,ok');
    expect(() => immutable.headers.set('x-probe', '1')).toThrow();

    const response = withSecurityHeaders(immutable, { overHttps: true });

    expect(response).not.toBe(immutable);
    expect(response.status).toBe(immutable.status);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expectBaseline(response);
    expect(response.headers.get('strict-transport-security')).toBe(EXPECTED_HSTS);
    expect(await response.text()).toBe('ok');
  });

  it('leaves other headers, such as the CSP, untouched', () => {
    const csp = "default-src 'self'";
    const page = new Response('ok', { headers: { 'content-security-policy': csp } });

    const response = withSecurityHeaders(page, { overHttps: true });

    expect(response.headers.get('content-security-policy')).toBe(csp);
  });
});
