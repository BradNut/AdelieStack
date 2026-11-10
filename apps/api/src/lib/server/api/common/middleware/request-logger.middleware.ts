import { pinoLogger } from 'hono-pino';
import type { Logger } from 'pino';
import { AuthEndpoint } from '#lib/server/api/auth/auth.endpoints';

const REDACTED_PATH_SEGMENT = '[REDACTED]';

/** Better Auth's emailed password-reset link is the one route that carries a credential in its path. */
const RESET_PASSWORD_TOKEN = new RegExp(`(${AuthEndpoint.RESET_PASSWORD}/+).+$`, 'i');

/** The path to log: never the query string, which holds verification tokens, and never a password-reset token. */
function sanitizedPath(path: string): string {
  return path.replace(RESET_PASSWORD_TOKEN, `$1${REDACTED_PATH_SEGMENT}`);
}

/**
 * Writes one entry per request holding only an allow-list of fields: request id, method, path, status and duration.
 * Headers stay out entirely, because a cookie, bearer token or webhook secret in a log lets its reader act as that caller.
 */
export function requestLogger(pino: Logger) {
  return pinoLogger({
    pino,
    http: {
      onReqBindings: (c) => ({ req: { method: c.req.method, url: sanitizedPath(c.req.path) } }),
      onResBindings: (c) => ({ res: { status: c.res.status } }),
    },
  });
}
