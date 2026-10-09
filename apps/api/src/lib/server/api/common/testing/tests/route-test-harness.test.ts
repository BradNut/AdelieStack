import { beforeEach, describe, expect, it } from 'vitest';
// The harness must be imported before the mocked middleware so its vi.mock calls register first.
import { authStateMock, buildRouteApp, rateLimitMock, resetRouteTestMocks } from '../route-test-harness';
import { Controller } from '../../factories/controllers.factory';
import { authState } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rate-limit.middleware';

/** Minimal controller that exercises both guarded middleware, standing in for a real route. */
class SampleController extends Controller {
  routes() {
    return this.controller.get('/ping', authState('none'), rateLimit({ limit: 3, minutes: 1 }), (c) => c.json({ message: 'pong' }));
  }
}

function buildApp() {
  return buildRouteApp(new SampleController().routes(), '/sample');
}

describe('route-test-harness', () => {
  beforeEach(() => {
    resetRouteTestMocks();
  });

  it('drives a mounted route through .request() with pass-through middleware', async () => {
    const res = await buildApp().request('/sample/ping');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ message: 'pong' });
    expect(authStateMock).toHaveBeenCalledWith('none');
    expect(rateLimitMock).toHaveBeenCalledWith({ limit: 3, minutes: 1 });
  });

  it('lets a test simulate a blocked auth state', async () => {
    authStateMock.mockReturnValue(async (c) => c.json({ message: 'unauthorized' }, 401));

    const res = await buildApp().request('/sample/ping');

    expect(res.status).toBe(401);
  });

  it('lets a test simulate a tripped rate limit', async () => {
    rateLimitMock.mockReturnValue(async (c) => c.json({ message: 'too many requests' }, 429));

    const res = await buildApp().request('/sample/ping');

    expect(res.status).toBe(429);
  });
});
