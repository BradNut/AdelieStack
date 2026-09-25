import { Hono } from 'hono';
import type { PinoLogger } from 'hono-pino';
import type { SessionDto } from '../../iam/sessions/dtos/session.dto';
import type { Locale } from '../i18n/locale';

export type HonoEnv = {
  Variables: {
    logger: PinoLogger;
    session: SessionDto | null;
    browserSessionId: string;
    requestId: string;
    locale: Locale;
  };
};

export type AppOpenAPI = Hono<HonoEnv>;

export function createHono() {
  return new Hono<HonoEnv>();
}
