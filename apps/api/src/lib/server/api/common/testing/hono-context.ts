import type { Context } from 'hono';
import { createHono, type HonoEnv } from '../utils/hono';

export const TEST_REQUEST_URL = 'http://localhost/test';

/**
 * Runs `handler` inside a real Hono request so cookie/header helpers get a genuine `Context`.
 * Returns the resulting `Response` for assertions on headers and status.
 */
export async function runInHonoContext(handler: (c: Context<HonoEnv>) => Promise<void> | void, init: RequestInit = {}): Promise<Response> {
  const app = createHono();
  app.all('*', async (c) => {
    await handler(c);
    return c.body(null, 204);
  });
  return app.request(TEST_REQUEST_URL, init);
}
