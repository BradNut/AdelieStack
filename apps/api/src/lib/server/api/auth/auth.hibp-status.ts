import { PASSWORD_CHECK_UNAVAILABLE } from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';

/** Stable, greppable log message for every failed breached-password check. */
export const HIBP_CHECK_FAILED_LOG = 'HIBP_CHECK_FAILED';

/** What the health surface reports about Have I Been Pwned. */
export const HibpHealth = {
  /** The switch (`HIBP_ENABLED`) is off. */
  DISABLED: 'disabled',
  /** On, but no check has run since the server started. */
  UNKNOWN: 'unknown',
  /** The most recent check succeeded. */
  AVAILABLE: 'available',
  /** The most recent check failed. */
  UNAVAILABLE: 'unavailable',
} as const;

export type HibpHealthStatus = (typeof HibpHealth)[keyof typeof HibpHealth];

interface HibpLogger {
  error(obj: Record<string, unknown>, message: string): void;
}

/**
 * Remembers the outcome of the most recent HIBP check so health probes can report it without
 * calling HIBP themselves.
 */
export class HibpStatus {
  private lastCheckOk: boolean | null = null;

  constructor(private readonly options: { enabled: boolean; log?: HibpLogger }) {}

  recordSuccess(): void {
    this.lastCheckOk = true;
  }

  /** Marks HIBP unavailable and writes one error log entry carrying {@link HIBP_CHECK_FAILED_LOG}. */
  recordFailure(error: unknown): void {
    this.lastCheckOk = false;
    this.options.log?.error({ err: error }, `${HIBP_CHECK_FAILED_LOG}: breached-password check failed; set HIBP_ENABLED=false and restart to bypass`);
  }

  get health(): HibpHealthStatus {
    if (!this.options.enabled) return HibpHealth.DISABLED;
    if (this.lastCheckOk === null) return HibpHealth.UNKNOWN;
    return this.lastCheckOk ? HibpHealth.AVAILABLE : HibpHealth.UNAVAILABLE;
  }
}

/**
 * Sits after the `haveIBeenPwned` plugin and wraps its password hashing to observe the check: a hash
 * that completes (or is rejected as `PASSWORD_COMPROMISED`) means HIBP answered, and the plugin's
 * unreachable-HIBP failure is recorded, logged, and re-thrown as a 503 `PASSWORD_CHECK_UNAVAILABLE`.
 * Makes no HIBP request of its own, and does nothing when screening is off.
 */
export const hibpMonitor = (status: HibpStatus, { enabled }: { enabled: boolean }): BetterAuthPlugin => ({
  id: 'hibp-monitor',
  init(ctx) {
    if (!enabled) return;
    const innerHash = ctx.password.hash;
    return {
      context: {
        password: {
          ...ctx.password,
          async hash(password: string) {
            try {
              const hashed = await innerHash(password);
              status.recordSuccess();
              return hashed;
            } catch (error) {
              if (error instanceof APIError && error.status === 'INTERNAL_SERVER_ERROR') {
                status.recordFailure(error);
                throw new APIError('SERVICE_UNAVAILABLE', { code: PASSWORD_CHECK_UNAVAILABLE, message: PASSWORD_CHECK_UNAVAILABLE });
              }
              if (error instanceof APIError) status.recordSuccess();
              throw error;
            }
          },
        },
      },
    };
  },
});
