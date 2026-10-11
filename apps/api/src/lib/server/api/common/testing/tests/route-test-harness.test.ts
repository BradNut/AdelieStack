import { beforeEach, describe, expect, it } from 'vitest';
import { Controller } from '../../factories/controllers.factory';
import { rateLimit } from '../../middleware/rate-limit.middleware';
// The harness must be imported before the mocked middleware so its vi.mock calls register first.
import { buildRouteApp, rateLimitMock, resetRouteTestMocks } from '../route-test-harness';

/** Minimal controller that exercises the guarded rate-limit middleware, standing in for a real route. */
class SampleController extends Controller {
  routes() {
    return this.controller.get('/ping', rateLimit({ limit: 3, minutes: 1 }), (c) => c.json({ message: 'pong' }));
  }
}

function buildApp() {
  return buildRouteApp(new SampleController().routes(), '/sample');
}

describe('route-test-harness', () => {
  beforeEach(() => {
    resetRouteTestMocks();
  });

  it('drives a mounted route through .request() with pass-through rate limiting', async () => {
    const res = await buildApp().request('/sample/ping');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ message: 'pong' });
    expect(rateLimitMock).toHaveBeenCalledWith({ limit: 3, minutes: 1 });
  });

  it('lets a test simulate a tripped rate limit', async () => {
    rateLimitMock.mockReturnValue(async (c) => c.json({ message: 'too many requests' }, 429));

    const res = await buildApp().request('/sample/ping');

    expect(res.status).toBe(429);
  });
});
