import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthSession, AuthUser } from '../../auth/auth.config';
import { m } from '../i18n';
import { Unauthorized } from '../utils/exceptions';

/* ---------------------------------- Types --------------------------------- */
type AuthStates = 'session' | 'none';
type AuthedReturnType = typeof authed;
type UnauthedReturnType = typeof unauthed;

/* ------------------- Overloaded function implementation ------------------- */
// we have to overload the implementation to provide the correct return type
export function authState(state: 'session'): AuthedReturnType;
export function authState(state: 'none'): UnauthedReturnType;
export function authState(state: AuthStates): AuthedReturnType | UnauthedReturnType {
  if (state === 'session') {
    return authed;
  }
  return unauthed;
}

/* ------------------------------ Require Auth ------------------------------ */
const authed: MiddlewareHandler<{
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
}> = createMiddleware(async (c, next) => {
  if (!c.var.session) {
    throw Unauthorized(m.auth_login_required());
  }
  return next();
});

/* ---------------------------- Require Unauthed ---------------------------- */
const unauthed: MiddlewareHandler<{
  Variables: {
    user: null;
    session: null;
  };
}> = createMiddleware(async (c, next) => {
  if (c.var.session) {
    throw Unauthorized(m.auth_logout_required());
  }
  return next();
});
