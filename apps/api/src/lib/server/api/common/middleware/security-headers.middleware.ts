import { applySecurityHeaders, FORWARDED_PROTO_HEADER } from '@adelie/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ClientIpOptions } from '#lib/server/api/common/utils/ip';

/**
 * Whether the client reached us over https: the request's own scheme, or, only with `trustProxy`, the leftmost
 * {@link FORWARDED_PROTO_HEADER} entry (the scheme the first proxy saw). The web app's /api proxy sets it from the scheme it resolved.
 */
function isHttps(c: Context, { trustProxy }: Pick<ClientIpOptions, 'trustProxy'>): boolean {
  if (new URL(c.req.url).protocol === 'https:') return true;
  if (!trustProxy) return false;
  return c.req.header(FORWARDED_PROTO_HEADER)?.split(',')[0]?.trim().toLowerCase() === 'https';
}

/** Sets the shared security headers on every response, Better Auth's, 404s and errors included. HSTS only over https. */
export function securityHeaders(options: Pick<ClientIpOptions, 'trustProxy'>): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    await next();
    const https = isHttps(c, options);
    try {
      applySecurityHeaders(c.res.headers, { https });
    } catch {
      // A response with immutable headers (one passed straight through from `fetch`); copy it to set them.
      c.res = new Response(c.res.body, c.res);
      applySecurityHeaders(c.res.headers, { https });
    }
  });
}
