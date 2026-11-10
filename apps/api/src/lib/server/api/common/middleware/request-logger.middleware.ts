import type { MiddlewareHandler } from 'hono';
import { type Env, pinoLogger } from 'hono-pino';
import type { Logger } from 'pino';
import { AuthEndpoint } from '#lib/server/api/auth/auth.endpoints';

const REDACTED_PATH_SEGMENT = '[REDACTED]';

/** Fixed response messages: the library default on failure is `c.error.message`, free text that can hold anything. */
const REQUEST_COMPLETED_MESSAGE = 'Request completed';
const REQUEST_FAILED_MESSAGE = 'Request failed';

/**
 * Better Auth's emailed password-reset link is the one route that carries a credential in its path.
 * Any separator counts, so a route name followed by an encoded `/`, `?` or `\` is still a token, while
 * `-`, `_` and letters continue a different route name.
 */
const RESET_PASSWORD_TOKEN_PATTERN = new RegExp(`(${AuthEndpoint.RESET_PASSWORD}(?:/+|[^\\w/-])).+$`, 'is');

/** Only ASCII escapes can spell the route name or a separator. Multi-byte ones stay encoded and never throw. */
const ASCII_PERCENT_ESCAPE_PATTERN = /%([0-7][0-9a-f])/gi;

/** Deeper than any real client or proxy re-encodes, and small enough that a crafted path costs next to nothing to decode. */
const MAX_PERCENT_DECODE_PASSES = 5;

/** `path` with its ASCII escapes decoded to a fixed point, or null if it is still changing after the pass limit. */
function percentDecodedAscii(path: string): string | null {
  let current = path;
  for (let pass = 0; pass < MAX_PERCENT_DECODE_PASSES; pass++) {
    const next = current.replace(ASCII_PERCENT_ESCAPE_PATTERN, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
    if (next === current) return current;
    current = next;
  }
  return null;
}

/**
 * The path to log: never the query string, which holds verification tokens, and never a password-reset token.
 * Hono decodes the path only once and leaves `%2F` and `%25` encoded, so matching runs on a fully decoded copy.
 * Paths without a token keep their original spelling; a path nested past the pass limit is withheld entirely.
 */
function sanitizedPath(path: string): string {
  const decoded = percentDecodedAscii(path);
  if (decoded === null) return REDACTED_PATH_SEGMENT;

  const redacted = decoded.replace(RESET_PASSWORD_TOKEN_PATTERN, `$1${REDACTED_PATH_SEGMENT}`);
  return redacted === decoded ? path : redacted;
}

/**
 * Writes one entry per request holding only pino's standard fields (`level`, `time`, `pid`, `hostname`) and an
 * allow-list: request id, method, path, status, duration and a fixed `msg`. `level` is `error` when a handler threw
 * and `info` otherwise. `msg` is fixed so an error message, which is free text, cannot carry a secret into the log.
 * Headers stay out entirely, because a cookie, bearer token or webhook secret in a log lets its reader act as that caller.
 */
export function requestLogger(logger: Logger): MiddlewareHandler<Env> {
  return pinoLogger({
    pino: logger,
    http: {
      onReqBindings: (c) => ({ req: { method: c.req.method, url: sanitizedPath(c.req.path) } }),
      onResBindings: (c) => ({ res: { status: c.res.status } }),
      onResMessage: (c) => (c.error ? REQUEST_FAILED_MESSAGE : REQUEST_COMPLETED_MESSAGE),
    },
  });
}
