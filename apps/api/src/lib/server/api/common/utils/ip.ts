import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import type { Context } from 'hono';

/**
 * Extracts the client IP address from the request, from the one header Better Auth also trusts
 * ({@link AUTH_CLIENT_IP_HEADER}), and only when TRUST_PROXY is enabled. No other header is read: a
 * proxy may set only that one, so a client could send any other and choose its own address.
 * Falls back to localhost when TRUST_PROXY is off, or the header is absent or its first value is
 * empty. That applies in production too, where those clients share one rate-limit bucket.
 */
export function getClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const clientIp = c.req.header(AUTH_CLIENT_IP_HEADER)?.split(',')[0].trim();
    if (clientIp) {
      return clientIp;
    }
  }

  // No client IP is known: every such request resolves to this one address, in any environment.
  return '127.0.0.1';
}
