import type { Hono, MiddlewareHandler } from 'hono';
import { type MockedFunction, vi } from 'vitest';
import { type AppOpenAPI, createHono } from '../utils/hono';

/**
 * Shared HTTP route-test harness. Importing this module (before the controller under test)
 * replaces the middleware that reach external infrastructure with pass-through doubles, so a
 * controller's routes can be driven with `app.request(...)` without a live Redis/auth stack.
 *
 * Call `resetRouteTestMocks()` in `beforeEach`, then override the exported mocks per test to
 * simulate an authenticated session or a tripped rate limit.
 */
const harnessMocks = vi.hoisted(() => ({
  authStateMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

export const authStateMock = harnessMocks.authStateMock as MockedFunction<(...args: unknown[]) => MiddlewareHandler>;
export const rateLimitMock = harnessMocks.rateLimitMock as MockedFunction<(...args: unknown[]) => MiddlewareHandler>;

vi.mock('../middleware/auth.middleware', () => ({
  authState: authStateMock,
}));

vi.mock('../middleware/rate-limit.middleware', () => ({
  rateLimit: rateLimitMock,
}));

/** Resets all harness mocks to their default pass-through behavior. */
export function resetRouteTestMocks(): void {
  vi.clearAllMocks();

  authStateMock.mockReturnValue(async (_c, next) => {
    await next();
  });

  rateLimitMock.mockReturnValue(async (_c, next) => {
    await next();
  });
}

/** Mounts a controller's `routes()` sub-app under `path` on a fresh Hono app for `.request()` driving. */
export function buildRouteApp(routes: AppOpenAPI, path: string): Hono {
  const app = createHono();
  return app.route(path, routes as never) as unknown as Hono;
}
