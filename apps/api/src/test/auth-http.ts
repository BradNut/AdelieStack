import { totpCode } from '@adelie/test-utils/totp';

/** A test's own call into its auth instance: POSTs `body` as JSON when given, otherwise GETs. */
export type AuthRequest = (path: string, options?: { body?: unknown; cookie?: string }) => Promise<Response>;

export interface AuthCredentials {
  email: string;
  password: string;
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
export async function signUpWithTotp(request: AuthRequest, { name, email, password }: AuthCredentials & { name: string }) {
  const signUp = await request('/sign-up/email', { body: { name, email, password } });
  const session = cookiesFrom(signUp);
  const enable = await request('/two-factor/enable', { cookie: session, body: { password } });
  const { totpURI, backupCodes } = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const verify = await request('/two-factor/verify-totp', { cookie: session, body: { code: totpCode(totpURI) } });
  return { totpURI, backupCodes, cookie: cookiesFrom(verify, session) };
}

/** Password sign-in for a two-factor user: returns the challenge cookie instead of a session. */
export async function startTwoFactorSignIn(request: AuthRequest, { email, password }: AuthCredentials) {
  const res = await request('/sign-in/email', { body: { email, password } });
  const { twoFactorRedirect } = (await res.json()) as { twoFactorRedirect?: boolean };
  return { challengeCookie: cookiesFrom(res), twoFactorRedirect };
}
