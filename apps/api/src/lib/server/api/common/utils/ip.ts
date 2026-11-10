import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import { getIPFromHeader } from '@better-auth/core/utils/ip';
import type { Context } from 'hono';

export { findInvalidTrustedProxies } from '@better-auth/core/utils/ip';

const NO_CLIENT_ADDRESS_FALLBACK = '127.0.0.1';

/** How the API learns who a client is. Without `trustProxy`, {@link AUTH_CLIENT_IP_HEADER} is not read at all. */
export interface ClientIpOptions {
  trustProxy: boolean;
  /** Proxies (IPs or CIDR ranges) known to append to the header, stripped from its right end. */
  trustedProxies: string[];
  /** The prefix an IPv6 client is keyed on. Omit for Better Auth's default, /64. */
  ipv6Subnet?: number;
}

/** The client IP settings from the validated environment. */
export function clientIpOptionsFromEnvs(envs: { TRUST_PROXY: boolean; TRUSTED_PROXIES: string[] }): ClientIpOptions {
  return { trustProxy: envs.TRUST_PROXY, trustedProxies: envs.TRUSTED_PROXIES };
}

/**
 * The address of the client, from the one header Better Auth also trusts ({@link AUTH_CLIENT_IP_HEADER}), resolved and
 * normalised by Better Auth's own `getIPFromHeader` so both limiters agree on a client. Null when TRUST_PROXY is off (no
 * header is read) or the header gives no trustworthy address. No other header is read: a proxy may set only that one, so
 * a client could send any other.
 */
export function resolveClientAddress(c: Context, { trustProxy, trustedProxies, ipv6Subnet }: ClientIpOptions): string | null {
  if (!trustProxy) return null;

  const value = c.req.header(AUTH_CLIENT_IP_HEADER);
  return value === undefined ? null : getIPFromHeader(value, { trustedProxies, ipv6Subnet });
}

/**
 * {@link resolveClientAddress}, with one shared address when there is none. That applies in production too, where those
 * clients share one rate-limit bucket.
 */
export function getClientIp(c: Context, options: ClientIpOptions): string {
  return resolveClientAddress(c, options) ?? NO_CLIENT_ADDRESS_FALLBACK;
}
