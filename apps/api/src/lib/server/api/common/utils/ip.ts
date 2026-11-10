import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { getIPFromHeader } from '@better-auth/core/utils/ip';
import type { Context } from 'hono';

export { findInvalidTrustedProxies } from '@better-auth/core/utils/ip';

const NO_CLIENT_ADDRESS_FALLBACK = '127.0.0.1';

/**
 * How the API learns who a client is, shared by both limiters (`rateLimit()` and Better Auth's) so they cannot diverge.
 * Without `trustProxy`, {@link AUTH_CLIENT_IP_HEADER} is not read at all.
 */
export interface ClientIpOptions {
  trustProxy: boolean;
  /** Proxies (IPs or CIDR ranges) known to append to the header, stripped from its right end. */
  trustedProxies: string[];
}

/** The client IP settings from the validated environment. The one place a new setting is mapped. */
export function clientIpOptionsFromEnvs(envs: { TRUST_PROXY: boolean; TRUSTED_PROXIES: string[] }): ClientIpOptions {
  return { trustProxy: envs.TRUST_PROXY, trustedProxies: envs.TRUSTED_PROXIES };
}

/**
 * The address of the client, from the one header Better Auth also trusts ({@link AUTH_CLIENT_IP_HEADER}), resolved and
 * normalised by Better Auth's own `getIPFromHeader` so both limiters agree on a client. Null when TRUST_PROXY is off (no
 * header is read) or the header gives no trustworthy address. No other header is read: a proxy may set only that one, so
 * a client could send any other.
 */
export function resolveClientAddress(c: Context, { trustProxy, trustedProxies }: ClientIpOptions): string | null {
  if (!trustProxy) return null;

  const value = c.req.header(AUTH_CLIENT_IP_HEADER);
  return value === undefined ? null : getIPFromHeader(value, { trustedProxies });
}

/**
 * {@link resolveClientAddress}, with one shared address when there is none. That applies in production too, where those
 * clients share one rate-limit bucket.
 */
export function getClientIp(c: Context, options: ClientIpOptions): string {
  return clientIpOrFallback(resolveClientAddress(c, options));
}

/** An address already resolved by {@link resolveClientAddress}, or the shared one when there is none. */
export function clientIpOrFallback(address: string | null): string {
  return address ?? NO_CLIENT_ADDRESS_FALLBACK;
}
