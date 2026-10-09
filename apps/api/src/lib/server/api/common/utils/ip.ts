import type { Context } from 'hono';

/**
 * Extracts the client IP address from the request.
 * Only trusts proxy headers when TRUST_PROXY is enabled, so a client cannot spoof its IP
 * by sending `x-forwarded-for` when the API is not actually behind a trusted proxy.
 * Falls back to localhost for local development.
 */
export function getClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    // Check multiple proxy headers in order of preference
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIp = c.req.header('x-real-ip');
    if (realIp) {
      return realIp.trim();
    }

    const cfConnectingIp = c.req.header('cf-connecting-ip');
    if (cfConnectingIp) {
      return cfConnectingIp.trim();
    }
  }

  // In local development without a proxy, default to localhost
  return '127.0.0.1';
}
