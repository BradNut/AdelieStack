import { AUTH_CLIENT_IP_HEADER, SECONDS_PER_MINUTE } from '@adelie/shared';
import type { Context } from 'hono';
import { type ClientIpOptions, resolveClientAddress } from './ip';

/** Often enough to stay visible in a log search, rarely enough that sustained traffic cannot flood the logs. */
export const MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS = 5 * SECONDS_PER_MINUTE * 1000;

const MISSING_CLIENT_ADDRESS_WARNING = `TRUST_PROXY is on but a request had no usable client address in ${AUTH_CLIENT_IP_HEADER}, so it shares one rate-limit bucket with others like it and clients can lock each other out. Have the proxy set ${AUTH_CLIENT_IP_HEADER} to the client's address, or declare appending proxies in TRUSTED_PROXIES. See the API environment runbook.`;

let lastWarnedAt = Number.NEGATIVE_INFINITY;

/**
 * Tells the operator, in the logs only, that a request fell into the shared rate-limit bucket because the proxy did not
 * supply a client address. Throttled per process. Names the header but never its value, which a client can influence.
 * `getLog` is called only when there is something to report.
 */
export function warnIfClientAddressMissing(c: Context, options: ClientIpOptions, getLog: () => { warn(message: string): void }): void {
  if (!options.trustProxy || resolveClientAddress(c, options) !== null) return;

  const now = Date.now();
  if (now - lastWarnedAt < MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS) return;

  lastWarnedAt = now;
  getLog().warn(MISSING_CLIENT_ADDRESS_WARNING);
}
