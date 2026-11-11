import { totpCode } from '@adelie/test-utils/totp';
import { createEmailVerificationToken } from 'better-auth/api';
import { TEST_EMAIL } from '#lib/server/api/common/testing/factories';
import type { SendProps } from '#lib/server/api/mail/interfaces/mailer.interface';
import { type createTestDatabase, TEST_AUTH_SECRET, TEST_ORIGIN } from './auth-instance';

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

/** The default user for tests that don't care about its details. Override one with a spread at the call site. */
export const TEST_USER = { name: 'Penguin', email: TEST_EMAIL, password: 'Correct-horse-9' };

export interface EmailSignUp {
  /** The sign-up response, with its body still unread. */
  res: Response;
  /** The session cookie from signing in once the email is verified, or an empty string when sign-up was rejected. */
  cookie: string;
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

/** Whether the response sets a session cookie, i.e. signed someone in. */
export function hasSessionCookie(res: Response): boolean {
  return res.headers.getSetCookie().some((c) => c.includes('session_token'));
}

/** The code in a two-factor OTP email, or undefined when `mail` is missing or holds no code. */
export function emailedOtp(mail: SendProps | undefined): string | undefined {
  return mail?.template.html().match(/token-text'>(\d+)</)?.[1];
}

/**
 * The link in an email, or an empty string when `mail` is missing or holds none. Read from the text part, where a
 * URL is raw; in the HTML its `&` is escaped.
 */
export function emailedLink(mail: SendProps | undefined): string {
  return mail?.template.text().match(/https?:\/\/\S+/)?.[0] ?? '';
}

const MS_PER_SECOND = 1000;

/** Backdates every session's sign-in in `db` by `ageSeconds`, e.g. past `AUTH_SESSION_FRESH_AGE` to make it stale. */
export function ageSessions(db: ReturnType<typeof createTestDatabase>['db'], ageSeconds: number): void {
  for (const s of db.session) s.createdAt = new Date(Date.now() - ageSeconds * MS_PER_SECOND);
}

/**
 * Clicks the verification link for `email`, as the one in the sign-up email does, over the real `/verify-email`
 * endpoint. The token is signed with the test auth secret, so this needs no mailer: it works when a test passes its own.
 */
export async function verifyEmail(request: AuthRequest, email: string): Promise<Response> {
  const token = await createEmailVerificationToken(TEST_AUTH_SECRET, email);
  return request(`/verify-email?token=${encodeURIComponent(token)}`);
}

/**
 * Sends the email/password sign-up request and nothing else: the email stays unverified, so the account cannot sign
 * in yet. Returns the sign-up response, with its body still unread.
 */
export function signUpUnverified(request: AuthRequest, { name, email, password }: SignUpCredentials): Promise<Response> {
  return request('/sign-up/email', { body: { name, email, password } });
}

/**
 * Signs up with email and password, verifies the email, then signs in: sign-up alone gives no session, since an
 * unverified account cannot sign in. A rejected sign-up does not throw and is not followed up: check `res`.
 */
export async function signUpWithEmail(request: AuthRequest, { name, email, password }: SignUpCredentials): Promise<EmailSignUp> {
  const res = await signUpUnverified(request, { name, email, password });
  if (!res.ok) return { res, cookie: '' };
  await verifyEmail(request, email);
  const signIn = await request('/sign-in/email', { body: { email, password } });
  return { res, cookie: cookiesFrom(signIn) };
}

/** Signs up, then enables two-factor and confirms it with a first TOTP code. */
export async function signUpWithTotp(request: AuthRequest, { name, email, password }: SignUpCredentials): Promise<TotpSignUp> {
  const { cookie: session } = await signUpWithEmail(request, { name, email, password });
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

/** Requests a password reset for {@link TEST_USER} and returns the emailed link's token, read from the rows in `db`. */
export async function resetToken(request: AuthRequest, db: ReturnType<typeof createTestDatabase>['db']): Promise<string> {
  const prefix = 'reset-password:';
  await request('/request-password-reset', { body: { email: TEST_USER.email, redirectTo: `${TEST_ORIGIN}/reset` } });
  const row = db.verification.find((v) => String(v.identifier).startsWith(prefix));
  return String(row?.identifier).slice(prefix.length);
}
