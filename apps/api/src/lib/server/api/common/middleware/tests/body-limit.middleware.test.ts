import { Environment, StatusCodes } from '@adelie/shared';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { requestId } from 'hono/request-id';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { declareBodyLimit, requestBodyLimit } from '#lib/server/api/common/middleware/body-limit.middleware';
import { errorHandler } from '#lib/server/api/common/middleware/error-handler.middleware';
import { requestLocale } from '#lib/server/api/common/middleware/locale.middleware';
import { createHono, type HonoEnv } from '#lib/server/api/common/utils/hono';

const DEFAULT_LIMIT = 10;
const UPLOAD_LIMIT = 100;

/** An app shaped like the real one: the limit on the root, and an upload route declared in a controller mounted under it. */
function buildApp() {
  const uploads = createHono()
    .post('/upload', declareBodyLimit(UPLOAD_LIMIT), async (c) => c.text(String((await c.req.text()).length)))
    .post('/note', async (c) => c.text(String((await c.req.text()).length)));

  return new Hono<HonoEnv>()
    .use(requestId())
    .use(contextStorage())
    .use(requestLocale)
    .use(requestBodyLimit(DEFAULT_LIMIT))
    .route('/files', uploads)
    .onError(errorHandler({ envs: { ENVIRONMENT: Environment.PRODUCTION }, logger: pino({ enabled: false }) }));
}

const post = (path: string, body: string | ReadableStream<Uint8Array>) =>
  buildApp().request(path, { method: 'POST', body, duplex: 'half' } as RequestInit);

function chunked(size: number): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(size)));
      controller.close();
    },
  });
}

describe('requestBodyLimit with a route-declared limit', () => {
  it('lets a route that declares a higher limit accept a body over the default, up to its own limit', async () => {
    const res = await post('/files/upload', 'x'.repeat(UPLOAD_LIMIT));

    expect(res.status).toBe(StatusCodes.OK);
    expect(await res.text()).toBe(String(UPLOAD_LIMIT));
  });

  it('refuses a body over the declared limit', async () => {
    const res = await post('/files/upload', 'x'.repeat(UPLOAD_LIMIT + 1));

    expect(res.status).toBe(StatusCodes.REQUEST_TOO_LONG);
  });

  it('refuses a chunked body over the declared limit', async () => {
    const res = await post('/files/upload', chunked(UPLOAD_LIMIT + 1));

    expect(res.status).toBe(StatusCodes.REQUEST_TOO_LONG);
  });

  it('keeps the default for a neighbouring route that declares nothing', async () => {
    const res = await post('/files/note', 'x'.repeat(DEFAULT_LIMIT + 1));

    expect(res.status).toBe(StatusCodes.REQUEST_TOO_LONG);
  });

  it('passes a chunked body at the default limit through whole', async () => {
    const res = await post('/files/note', chunked(DEFAULT_LIMIT));

    expect(res.status).toBe(StatusCodes.OK);
    expect(await res.text()).toBe(String(DEFAULT_LIMIT));
  });
});
