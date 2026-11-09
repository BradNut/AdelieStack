import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import type { Context } from 'hono';

/**
 * Extracts the client IP address from the request, from the one header Better Auth also trusts
 * ({@link AUTH_CLIENT_IP_HEADER}), and only when TRUST_PROXY is enabled. No other header is read: a
 * proxy may set only that one, so a client could send any other and choose its own address.
 * Falls back to localhost for local development.
 */
export function getClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header(AUTH_CLIENT_IP_HEADER);
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
  }

  // In local development without a proxy, default to localhost
  return '127.0.0.1';
}
