import { DEFAULT_COOKIE_ATTRIBUTES, isDevelopmentEnvironment } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { publicId } from '#lib/server/api/common/utils/crypto';

const BROWSER_SESSION_COOKIE_NAME = '_id';

/** Gives every browser a signed session id cookie, `Secure` everywhere but development. */
export function browserSessions({ SIGNING_SECRET, ENVIRONMENT }: Pick<EnvsDto, 'SIGNING_SECRET' | 'ENVIRONMENT'>): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const browserSessionCookie = await getSignedCookie(c, SIGNING_SECRET, BROWSER_SESSION_COOKIE_NAME);
    let browserSessionId = browserSessionCookie;

    if (!browserSessionCookie) {
      browserSessionId = publicId();
      await setSignedCookie(c, BROWSER_SESSION_COOKIE_NAME, browserSessionId, SIGNING_SECRET, {
        ...DEFAULT_COOKIE_ATTRIBUTES,
        secure: !isDevelopmentEnvironment(ENVIRONMENT),
        path: '/',
      });
    }

    c.set('browserSessionId', browserSessionId);
    return next();
  });
}
