import {
  CAPTCHA_PROTECTED_PATHS,
  CAPTCHA_RESPONSE_HEADER,
  CAPTCHA_UNAVAILABLE,
  CaptchaProvider,
  type CaptchaProvider as CaptchaProviderName,
} from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { captcha } from 'better-auth/plugins';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';

/** Stable, greppable log message for every failed Captcha Token verification. */
export const CAPTCHA_VERIFY_FAILED_LOG = 'CAPTCHA_VERIFY_FAILED';

/** What the health surface reports about the Captcha Provider. */
export const CaptchaHealth = {
  /** The switch (`CAPTCHA_ENABLED`) is off. */
  DISABLED: 'disabled',
  /** On, but no token has been verified since the server started. */
  UNKNOWN: 'unknown',
  /** The most recent verification reached the provider. */
  AVAILABLE: 'available',
  /** The most recent verification could not reach the provider. */
  UNAVAILABLE: 'unavailable',
} as const;

export type CaptchaHealthStatus = (typeof CaptchaHealth)[keyof typeof CaptchaHealth];

/** Outcomes a verification can have once captcha is on; `UNKNOWN` and `DISABLED` are states, not outcomes. */
type CaptchaCheckResult = typeof CaptchaHealth.AVAILABLE | typeof CaptchaHealth.UNAVAILABLE;

/** Better Auth's code for a verification that threw: here, only a provider that cannot be reached or answers an error. */
const PLUGIN_UNKNOWN_ERROR = 'UNKNOWN_ERROR';

interface CaptchaLogger {
  error(obj: Record<string, unknown>, message: string): void;
}

/** What a deployer configures; the secret never leaves the API. */
export interface CaptchaConfig {
  provider: CaptchaProviderName;
  secretKey: string;
  siteKey: string;
  /** reCAPTCHA v3 only. */
  minScore?: number;
}

/** The captcha settings in the validated env, or undefined when captcha is off. The env schema guarantees the rest whenever it is on. */
export function captchaConfigFromEnvs(envs: EnvsDto): CaptchaConfig | undefined {
  const { CAPTCHA_ENABLED, CAPTCHA_PROVIDER, CAPTCHA_SECRET_KEY, CAPTCHA_SITE_KEY, CAPTCHA_MIN_SCORE } = envs;
  if (!CAPTCHA_ENABLED || !CAPTCHA_PROVIDER || !CAPTCHA_SECRET_KEY || !CAPTCHA_SITE_KEY) return undefined;
  return { provider: CAPTCHA_PROVIDER, secretKey: CAPTCHA_SECRET_KEY, siteKey: CAPTCHA_SITE_KEY, minScore: CAPTCHA_MIN_SCORE };
}

/** Remembers the outcome of the most recent verification so health probes can report it without calling the provider. */
export class CaptchaStatus {
  private lastCheck: CaptchaCheckResult | null = null;

  constructor(private readonly options: { enabled: boolean; log?: CaptchaLogger }) {}

  get enabled(): boolean {
    return this.options.enabled;
  }

  recordSuccess(): void {
    this.lastCheck = CaptchaHealth.AVAILABLE;
  }

  /** Marks the provider unavailable and writes one error log entry carrying {@link CAPTCHA_VERIFY_FAILED_LOG}. */
  recordFailure(): void {
    this.lastCheck = CaptchaHealth.UNAVAILABLE;
    this.options.log?.error({}, `${CAPTCHA_VERIFY_FAILED_LOG}: captcha provider unreachable; set CAPTCHA_ENABLED=false and restart to bypass`);
  }

  get health(): CaptchaHealthStatus {
    if (!this.options.enabled) return CaptchaHealth.DISABLED;
    return this.lastCheck ?? CaptchaHealth.UNKNOWN;
  }
}

/** The 503 returned when the Captcha Provider could not be reached; the web maps its code to a translated message. */
const captchaUnavailable = () =>
  new Response(JSON.stringify({ code: CAPTCHA_UNAVAILABLE, message: CAPTCHA_UNAVAILABLE }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });

function buildPlugin({ provider, secretKey, siteKey, minScore }: CaptchaConfig) {
  const base = { secretKey, endpoints: [...CAPTCHA_PROTECTED_PATHS] };
  switch (provider) {
    case CaptchaProvider.TURNSTILE:
      return captcha({ ...base, provider });
    case CaptchaProvider.RECAPTCHA:
      return captcha({ ...base, provider, minScore });
    case CaptchaProvider.HCAPTCHA:
    case CaptchaProvider.CAPTCHAFOX:
      return captcha({ ...base, provider, siteKey });
  }
}

/**
 * The plugin turns any throw while verifying (in practice only an unreachable or erroring provider) into a 500 with
 * code `UNKNOWN_ERROR`. The outage tests in auth.captcha.test.ts fail if a Better Auth upgrade changes that.
 */
async function isProviderOutage(result: Awaited<ReturnType<NonNullable<BetterAuthPlugin['onRequest']>>>): Promise<boolean> {
  const response = result && 'response' in result ? result.response : undefined;
  if (response?.status !== 500) return false;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null;
  return body?.code === PLUGIN_UNKNOWN_ERROR;
}

const isProtectedPath = (request: Request, basePath: string): boolean => {
  const path = new URL(request.url).pathname.slice(basePath.length);
  return (CAPTCHA_PROTECTED_PATHS as readonly string[]).includes(path);
};

/**
 * Better Auth's `captcha` plugin over {@link CAPTCHA_PROTECTED_PATHS}, plus outage handling the plugin lacks: it
 * reports an unreachable provider as a generic 500, which is re-thrown here as a 503 `CAPTCHA_UNAVAILABLE`
 * (fail closed), logged, and recorded for the health surface. The plugin runs in `onRequest`, ahead of every
 * before-hook, so a bad token never reaches the password policy or the breached-password screen.
 */
export function captchaPlugin(config: CaptchaConfig, status: CaptchaStatus): BetterAuthPlugin {
  const inner = buildPlugin(config);
  return {
    ...inner,
    async onRequest(request, ctx) {
      const result = await inner.onRequest?.(request, ctx);
      if (!request.headers.has(CAPTCHA_RESPONSE_HEADER) || !isProtectedPath(request, ctx.options.basePath ?? '/api/auth')) return result;
      if (await isProviderOutage(result)) {
        status.recordFailure();
        return { response: captchaUnavailable() };
      }
      status.recordSuccess();
      return result;
    },
  };
}
