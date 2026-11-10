import { AUTH_CLIENT_IP_HEADER } from '@adelie/shared';
import type { Context } from 'hono';
import { z } from 'zod/v4';

const NO_CLIENT_ADDRESS_FALLBACK = '127.0.0.1';
/** Better Auth's default `ipv6Subnet`: one customer usually holds a whole /64, so it is one client. */
const IPV6_GROUPS_KEPT = 4;
const CIDR_PREFIX_PATTERN = /^\d+$/;

const ipv4Schema = z.ipv4();
const ipv6Schema = z.ipv6();

/** How the API learns who a client is. Without `trustProxy`, {@link AUTH_CLIENT_IP_HEADER} is not read at all. */
export interface ClientIpOptions {
  trustProxy: boolean;
  /** Proxies (IPs or CIDR ranges) known to append to the header, stripped from its right end. */
  trustedProxies: string[];
}

/*
 * The parsing below mirrors Better Auth's `getIPFromHeader` (`@better-auth/core/utils/ip`), quirks included, so both
 * limiters agree on a client. client-ip-parity.test.ts runs one table of header values through both.
 */

function isIPv4(ip: string): boolean {
  return ipv4Schema.safeParse(ip).success;
}

function isIPv6(ip: string): boolean {
  return ipv6Schema.safeParse(ip).success;
}

function expandIPv6(ipv6: string): string[] {
  if (!ipv6.includes('::')) return ipv6.split(':').map((group) => group.padStart(4, '0'));

  const [leftSide, rightSide] = ipv6.split('::');
  const left = leftSide ? leftSide.split(':') : [];
  const right = rightSide ? rightSide.split(':') : [];
  const zeros = Array<string>(8 - left.length - right.length).fill('0000');
  return [...left.map((group) => group.padStart(4, '0')), ...zeros, ...right.map((group) => group.padStart(4, '0'))];
}

/** The IPv4 address inside an IPv4-mapped IPv6 address such as `::ffff:192.0.2.1`, or null. */
function extractIPv4FromMapped(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const ipv4Part = lower.substring(7);
    if (isIPv4(ipv4Part)) return ipv4Part;
  }

  const parts = ipv6.split(':');
  if (parts.length === 7 && parts[5]?.toLowerCase() === 'ffff' && parts[6] && isIPv4(parts[6])) return parts[6];

  if (lower.includes(':ffff:')) {
    const groups = expandIPv6(ipv6);
    if (groups.length === 8 && groups.slice(0, 5).every((group) => group === '0000') && groups[5] === 'ffff') {
      const [high = '', low = ''] = groups.slice(6);
      return [high.substring(0, 2), high.substring(2, 4), low.substring(0, 2), low.substring(2, 4)]
        .map((byte) => Number.parseInt(byte, 16))
        .join('.');
    }
  }
  return null;
}

/** One rate-limit identity per address: the IPv4 address, or an IPv6 address cut to its /64. */
function normalizeIP(ip: string): string {
  if (!isIPv6(ip)) return ip.toLowerCase();

  const ipv4 = extractIPv4FromMapped(ip);
  if (ipv4) return ipv4.toLowerCase();
  return expandIPv6(ip)
    .map((group, index) => (index < IPV6_GROUPS_KEPT ? group : '0000'))
    .join(':')
    .toLowerCase();
}

function ipToBytes(ip: string): Uint8Array | null {
  if (isIPv4(ip)) return Uint8Array.from(ip.split('.').map(Number));
  if (!isIPv6(ip)) return null;

  const mapped = extractIPv4FromMapped(ip);
  if (mapped) return Uint8Array.from(mapped.split('.').map(Number));

  const bytes = new Uint8Array(16);
  expandIPv6(ip).forEach((group, index) => {
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 255;
  });
  return bytes;
}

interface Network {
  bytes: Uint8Array;
  prefix: number;
}

function parseNetwork(value: string): Network | null {
  const slash = value.lastIndexOf('/');
  const bytes = ipToBytes(slash === -1 ? value : value.slice(0, slash));
  if (!bytes) return null;

  const maxBits = bytes.length * 8;
  if (slash === -1) return { bytes, prefix: maxBits };

  const prefixPart = value.slice(slash + 1);
  if (!CIDR_PREFIX_PATTERN.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  return prefix <= maxBits ? { bytes, prefix } : null;
}

function isInNetwork(ip: Uint8Array, network: Network): boolean {
  if (ip.length !== network.bytes.length) return false;

  let bitsRemaining = network.prefix;
  for (let i = 0; i < ip.length && bitsRemaining > 0; i++) {
    const take = Math.min(bitsRemaining, 8);
    const mask = (255 << (8 - take)) & 255;
    if ((ip[i] & mask) !== (network.bytes[i] & mask)) return false;
    bitsRemaining -= 8;
  }
  return true;
}

/** Entries that are neither an IP address nor a CIDR range; Better Auth would silently ignore them. */
export function findInvalidTrustedProxies(entries: string[]): string[] {
  return entries.filter((entry) => parseNetwork(entry) === null);
}

function parseForwardedHeader(value: string, trustedProxies: string[]): string | null {
  const forwarded = value
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (forwarded.length === 0) return null;

  const networks = trustedProxies.map(parseNetwork).filter((network) => network !== null);
  if (networks.length === 0) {
    // Nothing says which hops are real, so only a lone address can be believed.
    const [only] = forwarded;
    return forwarded.length === 1 && (isIPv4(only) || isIPv6(only)) ? normalizeIP(only) : null;
  }

  // The left of the chain is whatever the client sent; only what our own proxies appended counts.
  for (let i = forwarded.length - 1; i >= 0; i--) {
    const ip = forwarded[i];
    const bytes = ipToBytes(ip);
    if (!bytes) return null;
    if (!networks.some((network) => isInNetwork(bytes, network))) return normalizeIP(ip);
  }
  return null;
}

/**
 * The address of the client, from the one header Better Auth also trusts ({@link AUTH_CLIENT_IP_HEADER}) and resolved
 * the way Better Auth resolves it. Null when TRUST_PROXY is off (no header is read) or the header gives no trustworthy
 * address. No other header is read: a proxy may set only that one, so a client could send any other.
 */
export function resolveClientAddress(c: Context, { trustProxy, trustedProxies }: ClientIpOptions): string | null {
  if (!trustProxy) return null;

  const value = c.req.header(AUTH_CLIENT_IP_HEADER);
  return value === undefined ? null : parseForwardedHeader(value, trustedProxies);
}

/**
 * {@link resolveClientAddress}, with one shared address when there is none. That applies in production too, where those
 * clients share one rate-limit bucket.
 */
export function getClientIp(c: Context, options: ClientIpOptions): string {
  return resolveClientAddress(c, options) ?? NO_CLIENT_ADDRESS_FALLBACK;
}
