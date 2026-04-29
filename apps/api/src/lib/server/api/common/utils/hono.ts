import { Hono } from 'hono';
import type { SessionDto } from '../../iam/sessions/dtos/session.dto';
import type { PinoLogger } from 'hono-pino';

export type HonoEnv = {
  Variables: {
    logger: PinoLogger;
    session: SessionDto | null;
    browserSessionId: string;
    requestId: string;
  };
};

export function createHono() {
  return new Hono<HonoEnv>();
}
