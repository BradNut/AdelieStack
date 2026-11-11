import { FORWARDED_PROTO_HEADER, withSecurityHeaders } from '@adelie/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export interface SecurityHeadersOptions {
  /** Whether a trusted reverse proxy sits in front (`TRUST_PROXY`), so its {@link FORWARDED_PROTO_HEADER} may be read. */
  trustProxy: boolean;
}

/**
 * Whether the client reached us over https: the request's own scheme, or, only with `trustProxy`, the leftmost
 * {@link FORWARDED_PROTO_HEADER} entry (the scheme the first proxy saw). The web app's /api proxy sets it from the scheme it resolved.
 */
function reachedOverHttps(c: Context, { trustProxy }: SecurityHeadersOptions): boolean {
  if (new URL(c.req.url).protocol === 'https:') return true;
  if (!trustProxy) return false;
  return c.req.header(FORWARDED_PROTO_HEADER)?.split(',')[0]?.trim().toLowerCase() === 'https';
}

/** Sets the shared security headers on every response, Better Auth's, 404s and errors included. HSTS only over https. */
export function securityHeaders(options: SecurityHeadersOptions): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    await next();
    const secured = withSecurityHeaders(c.res, { overHttps: reachedOverHttps(c, options) });
    if (secured !== c.res) {
      // A copy of a response with immutable headers. Hono's setter would merge the old headers back in, undoing a
      // removed HSTS; the copy already carries them all, so drop the old response first.
      c.res = undefined;
      c.res = secured;
    }
  });
}
