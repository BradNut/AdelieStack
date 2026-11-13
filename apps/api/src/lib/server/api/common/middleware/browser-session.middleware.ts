import { DEFAULT_COOKIE_ATTRIBUTES, isProdEnv } from '@adelie/shared';
import type { MiddlewareHandler } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { publicId } from '#lib/server/api/common/utils/crypto';

const BROWSER_SESSION_COOKIE_NAME = '_id';

export function browserSessions({ SIGNING_SECRET, ENV }: Pick<EnvsDto, 'SIGNING_SECRET' | 'ENV'>): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const browserSessionCookie = await getSignedCookie(c, SIGNING_SECRET, BROWSER_SESSION_COOKIE_NAME);
    let browserSessionId = browserSessionCookie;

    if (!browserSessionCookie) {
      browserSessionId = publicId();
      await setSignedCookie(c, BROWSER_SESSION_COOKIE_NAME, browserSessionId, SIGNING_SECRET, {
        ...DEFAULT_COOKIE_ATTRIBUTES,
        secure: isProdEnv(ENV),
        path: '/',
      });
    }

    c.set('browserSessionId', browserSessionId);
    return next();
  });
}
