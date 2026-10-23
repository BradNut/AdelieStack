import { totpCode } from '@adelie/test-utils/totp';

export interface AuthRequestOptions {
  body?: unknown;
  cookie?: string;
  /** Extra request headers, set on top of the defaults. */
  headers?: Record<string, string>;
  /** Overrides the default: GET without a body, POST with one. */
  method?: string;
}

/** A test's own call into its auth instance at `/api/auth${path}`. The helpers always pass a JSON `body`. */
export type AuthRequest = (path: string, options?: AuthRequestOptions) => Promise<Response>;

interface AuthCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials extends AuthCredentials {
  name: string;
}

export interface TotpSignUp {
  totpURI: string;
  backupCodes: string[];
  /** The session cookie after two-factor is confirmed. */
  cookie: string;
}

export interface TwoFactorSignInStart {
  challengeCookie: string;
  twoFactorRedirect?: boolean;
}

/**
 * The response's Set-Cookie pairs as a Cookie header for the next request. Pass the earlier Cookie header as
 * `previous` to keep the cookies the response does not replace.
 */
export function cookiesFrom(res: Response, previous = ''): string {
  const jar = new Map(
    previous
      .split('; ')
      .filter(Boolean)
      .map((c) => [c.split('=')[0], c] as const),
  );
  for (const c of res.headers.getSetCookie()) {
    const pair = c.split(';')[0];
    jar.set(pair.split('=')[0], pair);
  }
  return [...jar.values()].join('; ');
}

/** Signs up, then enables two-factor and confirms it with a first TOTP code. */
export async function signUpWithTotp(request: AuthRequest, { name, email, password }: SignUpCredentials): Promise<TotpSignUp> {
  const signUp = await request('/sign-up/email', { body: { name, email, password } });
  const session = cookiesFrom(signUp);
  const enable = await request('/two-factor/enable', { cookie: session, body: { password } });
  const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const verify = await request('/two-factor/verify-totp', { cookie: session, body: { code: totpCode(totpURI) } });
  return { totpURI, backupCodes, cookie: cookiesFrom(verify, session) };
}

/** Password sign-in for a two-factor user: returns the challenge cookie instead of a session. */
export async function startTwoFactorSignIn(request: AuthRequest, { email, password }: AuthCredentials): Promise<TwoFactorSignInStart> {
  const res = await request('/sign-in/email', { body: { email, password } });
  const { twoFactorRedirect } = (await res.json()) as { twoFactorRedirect?: boolean };
  return { challengeCookie: cookiesFrom(res), twoFactorRedirect };
}
