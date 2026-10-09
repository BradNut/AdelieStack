import type { Hono, MiddlewareHandler } from 'hono';
import { type MockedFunction, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth.config';
import { type AppOpenAPI, createHono } from '../utils/hono';
import { buildAuthSession } from './factories';

/**
 * Shared HTTP route-test harness. Importing this module (before the controller under test)
 * replaces the middleware that reach external infrastructure with pass-through doubles, so a
 * controller's routes can be driven with `app.request(...)` without a live Redis/auth stack.
 *
 * Call `resetRouteTestMocks()` in `beforeEach`, then override the exported mocks per test to
 * simulate an authenticated session or a tripped rate limit. Pass `user` to `buildRouteApp` to
 * run the routes as that signed-in user (what the `authSession` middleware sets in the app).
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

/**
 * Mounts a controller's `routes()` sub-app under `path` on a fresh Hono app for `.request()`
 * driving. With `user`, every request carries that user and a matching session on `c.var`;
 * without it, requests are signed out.
 */
export function buildRouteApp(routes: AppOpenAPI, path: string, { user = null }: { user?: AuthUser | null } = {}): Hono {
  const app = createHono().use(async (c, next) => {
    c.set('user', user);
    c.set('session', user ? buildAuthSession({ userId: user.id }) : null);
    await next();
  });
  return app.route(path, routes as never) as unknown as Hono;
}
