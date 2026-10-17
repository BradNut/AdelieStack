import { DEFAULT_COOKIE_ATTRIBUTES, isProdEnv } from '@adelie/shared';
import { Container } from '@needle-di/core';
import type { MiddlewareHandler } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { generateId } from '#lib/server/api/common/utils/crypto';

export const browserSessions: MiddlewareHandler = createMiddleware(async (c, next) => {
  const BROWSER_SESSION_COOKIE_NAME = '_id';
  const container = new Container();
  const configService = container.get(ConfigService);
  const browserSessionCookie = await getSignedCookie(c, configService.envs.SIGNING_SECRET, BROWSER_SESSION_COOKIE_NAME);
  let browserSessionId = browserSessionCookie;

  if (!browserSessionCookie) {
    browserSessionId = generateId();
    await setSignedCookie(c, BROWSER_SESSION_COOKIE_NAME, browserSessionId, configService.envs.SIGNING_SECRET, {
      ...DEFAULT_COOKIE_ATTRIBUTES,
      secure: isProdEnv(configService.envs.ENV),
      path: '/',
    });
  }

  c.set('browserSessionId', browserSessionId);
  return next();
});
