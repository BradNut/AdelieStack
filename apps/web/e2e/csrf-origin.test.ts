import { expect, request, test } from '@playwright/test';
import { NODE_SERVER_ORIGIN, WEB_ORIGIN } from '../playwright.config';

// Runs against `node build` (adapter-node), not `vite preview`: only the real server derives the request origin.
// The server listens on a different port than WEB_ORIGIN, so a request is only accepted when the trusted origin comes from
// `paths.origin` (built from WEB_ORIGIN) rather than from the Host header, which is how a plain-HTTP deployment behaves.
test.describe('form POST origin check (adapter-node)', () => {
  const post = async (origin: string) => {
    const context = await request.newContext({ baseURL: NODE_SERVER_ORIGIN });
    const response = await context.post('/login', { form: { email: 'a@example.com' }, headers: { origin } });
    const result = { status: response.status(), body: await response.text() };
    await context.dispose();
    return result;
  };

  test('accepts a form POST from the configured origin', async () => {
    // The page has no form action, so passing the origin check ends in 405 rather than 403.
    expect((await post(WEB_ORIGIN)).status).toBe(405);
  });

  test('rejects a form POST from another origin', async () => {
    const response = await post('http://evil.example');

    expect(response.status).toBe(403);
    expect(response.body).toContain('Cross-site POST form submissions are forbidden');
  });
});
