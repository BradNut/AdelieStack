import { AUTH_CLIENT_IP_HEADER, SECONDS_PER_MINUTE } from '@adelie/shared';
import type { Context } from 'hono';
import { type ClientIpOptions, resolveClientAddress } from './ip';

/** Often enough to stay visible in a log search, rarely enough that sustained traffic cannot flood the logs. */
export const MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS = 5 * SECONDS_PER_MINUTE * 1000;

const MISSING_CLIENT_ADDRESS_WARNING = `TRUST_PROXY is on but a request had no usable client address in ${AUTH_CLIENT_IP_HEADER}, so it shares one rate-limit bucket with others like it and clients can lock each other out. Have the proxy set ${AUTH_CLIENT_IP_HEADER} to the client's address, or declare appending proxies in TRUSTED_PROXIES. See the API environment runbook.`;

/** Where the missing-address warning goes. */
export interface WarningLog {
  warn(message: string): void;
}

/** Logs the missing-address warning, at most once per {@link MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS}. */
export type MissingClientAddressWarning = (getLog: () => WarningLog) => void;

/**
 * A throttled missing-address warning with its own state. `now` is injectable for tests; the app shares
 * {@link missingClientAddressWarning}, so the throttle is per process. `getLog` is called only when a warning is logged.
 */
export function createMissingClientAddressWarning(now: () => number = () => Date.now()): MissingClientAddressWarning {
  let lastWarnedAt = Number.NEGATIVE_INFINITY;

  return (getLog) => {
    const at = now();
    if (at - lastWarnedAt < MISSING_CLIENT_ADDRESS_WARNING_INTERVAL_MS) return;

    lastWarnedAt = at;
    getLog().warn(MISSING_CLIENT_ADDRESS_WARNING);
  };
}

/** The process-wide throttle both limiters report through. */
export const missingClientAddressWarning = createMissingClientAddressWarning();

/**
 * Resolves a request's client address once ({@link resolveClientAddress}) and tells the operator, in the logs only, when
 * TRUST_PROXY is on but the proxy supplied none, so the request falls into the shared rate-limit bucket. Names the
 * header but never its value, which a client can influence. Build it once, outside the per-request path.
 */
export function createClientAddressResolver(
  options: ClientIpOptions,
  getLog: () => WarningLog,
  warning: MissingClientAddressWarning = missingClientAddressWarning,
): (c: Context) => string | null {
  return (c) => {
    const address = resolveClientAddress(c, options);
    if (address === null && options.trustProxy) warning(getLog);
    return address;
  };
}
