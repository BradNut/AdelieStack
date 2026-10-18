import { AUTH_BASE_PATH, CAPTCHA_PROTECTED_PATHS } from '@adelie/shared';
import { CAPTCHA_BINDING_HEADER } from '#lib/constants/captcha.ts';

/** Full pathnames the captcha plugin guards. Exact match, as the plugin matches our list. */
const PROTECTED_PATHNAMES: ReadonlySet<string> = new Set(CAPTCHA_PROTECTED_PATHS.map((path) => `${AUTH_BASE_PATH}${path}`));

/** Only resolves relative URLs to read their pathname, so any origin works when there is no page. */
const FALLBACK_ORIGIN = 'http://localhost';

function pathnameOf(input: RequestInfo | URL): string {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, globalThis.location?.origin ?? FALLBACK_ORIGIN).pathname;
}

/**
 * Wraps a fetch so every request to a captcha-protected auth path must be bound to a Captcha Token by
 * `createCaptchaForm().attempt`, which marks it with {@link CAPTCHA_BINDING_HEADER}. The marker is stripped before
 * sending. It checks the binding, not the token, and ignores whether captcha is on, so a form that skips `attempt`
 * fails in local dev and CI, where captcha is off. In development an unbound request throws; in production it is
 * logged and sent unchanged, because the server's captcha plugin stays the authority (ADR 0004).
 */
export function withCaptchaBinding(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const pathname = pathnameOf(input);
    if (!PROTECTED_PATHNAMES.has(pathname)) return base(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(CAPTCHA_BINDING_HEADER)) {
      const message = `Unbound request to captcha-protected ${pathname}: make this auth call through createCaptchaForm().attempt.`;
      if (import.meta.env.DEV) throw new Error(message);
      console.error(message);
      return base(input, init);
    }
    headers.delete(CAPTCHA_BINDING_HEADER);
    return base(input, { ...init, headers });
  };
}
