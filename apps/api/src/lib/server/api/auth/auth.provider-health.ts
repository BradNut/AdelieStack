/** What the health surface reports about an external screening provider (Captcha Provider, Have I Been Pwned). */
export const ProviderHealthState = {
  /** The provider's switch is off. */
  DISABLED: 'disabled',
  /** On, but no call has been made since the server started. */
  UNKNOWN: 'unknown',
  /** The most recent call reached the provider. */
  AVAILABLE: 'available',
  /** The most recent call could not reach the provider. */
  UNAVAILABLE: 'unavailable',
} as const;

/** One of the {@link ProviderHealthState} values. */
export type ProviderHealthStateName = (typeof ProviderHealthState)[keyof typeof ProviderHealthState];

/** Outcomes a call can have once the provider is on; `UNKNOWN` and `DISABLED` are states, not outcomes. */
type ProviderCheckResult = typeof ProviderHealthState.AVAILABLE | typeof ProviderHealthState.UNAVAILABLE;

/** The slice of the logger that failures are written to. */
export interface ProviderHealthLogger {
  error(obj: Record<string, unknown>, message: string): void;
}

/** What an adapter supplies to track one provider. */
export interface ProviderHealthOptions {
  /** The provider's switch from the environment; off reports `DISABLED` whatever was recorded. */
  enabled: boolean;
  /** One error entry with this message is written per failure; keep it stable and greppable. */
  failureMessage: string;
  log?: ProviderHealthLogger;
}

/** Remembers the outcome of the most recent provider call so health probes can report it without calling the provider. */
export class ProviderHealth {
  private lastCheck: ProviderCheckResult | null = null;

  constructor(private readonly options: ProviderHealthOptions) {}

  get enabled(): boolean {
    return this.options.enabled;
  }

  recordSuccess(): void {
    this.lastCheck = ProviderHealthState.AVAILABLE;
  }

  /** Marks the provider unavailable and writes one error log entry carrying the failure message. */
  recordFailure(error?: unknown): void {
    this.lastCheck = ProviderHealthState.UNAVAILABLE;
    this.options.log?.error(error === undefined ? {} : { err: error }, this.options.failureMessage);
  }

  get health(): ProviderHealthStateName {
    if (!this.options.enabled) return ProviderHealthState.DISABLED;
    return this.lastCheck ?? ProviderHealthState.UNKNOWN;
  }
}
