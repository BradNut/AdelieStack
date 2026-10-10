import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthService } from '../../auth/auth.service';
import type { HonoEnv } from '../utils/hono';

/**
 * Resolves the Better Auth session from the request cookies and exposes it as `c.var.user`
 * and `c.var.session` (both `null` when signed out). Better Auth refreshes the session
 * cookie itself, so this middleware only reads.
 */
export function authSession(authService: AuthService): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const result = await authService.auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', result?.user ?? null);
    c.set('session', result?.session ?? null);
    await next();
  });
}
