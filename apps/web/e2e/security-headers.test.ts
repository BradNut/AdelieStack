import type { APIResponse } from '@playwright/test';
import { expect, test } from './support/test';

// Literal on purpose: a change to the policy should have to change this test too.
const EXPECTED_BASELINE = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=()',
};

function expectBaseline(response: APIResponse) {
  const headers = response.headers();
  for (const [name, value] of Object.entries(EXPECTED_BASELINE)) {
    expect(headers[name], name).toBe(value);
  }
}

test.describe('security headers', () => {
  test('a rendered page carries the baseline and keeps its CSP', async ({ request }) => {
    const response = await request.get('/login');

    expect(response.ok()).toBe(true);
    expectBaseline(response);
    expect(response.headers()['content-security-policy']).toContain('script-src');
  });

  test('a proxied API response carries the baseline', async ({ request }) => {
    const response = await request.get('/api/config');

    expect(response.ok()).toBe(true);
    expectBaseline(response);
  });

  test('neither sends HSTS over plain http', async ({ request }) => {
    for (const path of ['/login', '/api/config']) {
      expect((await request.get(path)).headers()['strict-transport-security'], path).toBeUndefined();
    }
  });
});
