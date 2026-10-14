import { Hono } from 'hono';
import type { PinoLogger } from 'hono-pino';
import type { AuthSession, AuthUser } from '#lib/server/api/auth/auth.config';
import type { Locale } from '#lib/server/api/common/i18n/locale';

export type HonoEnv = {
  Variables: {
    logger: PinoLogger;
    user: AuthUser | null;
    session: AuthSession | null;
    browserSessionId: string;
    requestId: string;
    locale: Locale;
  };
};

export type AppOpenAPI = Hono<HonoEnv>;

export function createHono() {
  return new Hono<HonoEnv>();
}
