import { APP_NAME, AUTH_BASE_PATH } from '@adelie/shared';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { type CreateAuthOptions, createAuth } from '#lib/server/api/auth/auth.config';
import { createHibpHealth } from '#lib/server/api/auth/auth.hibp-status';
import { requestLocale } from '#lib/server/api/common/middleware/locale.middleware';
import type { AuthRequest } from './auth-http';
import { createMailerServiceMock } from './mocks/mailer.mock';

/** The web origin auth tests send requests from; the test auth instance trusts only this origin. */
export const TEST_ORIGIN = 'http://localhost:5173';

type Row = Record<string, unknown>;

/** A Google `getUserInfo` answered locally: the profile is `email`, verified. */
export function stubGoogleUserInfo(email: string) {
  // Each provider types its user info and raw profile differently; Better Auth only passes them through.
  return async () => ({ user: { id: 'google-sub-1', email, emailVerified: true, name: 'Penguin' }, data: { sub: 'google-sub-1' } }) as never;
}

/**
 * Builds a Better Auth instance over a fresh in-memory database with test defaults: sign-up open, HIBP off
 * (no network), a fresh mailer spy. Pass only the options a test changes; they are spread over the defaults.
 * The returned `mailer` is the default spy, so it records nothing when a test passes its own `mailer`.
 */
export function createTestAuth(overrides: Partial<Omit<CreateAuthOptions, 'database'>> = {}) {
  const db: Record<string, Row[]> = { user: [], session: [], account: [], verification: [], twoFactor: [], passkey: [] };
  const mailer = createMailerServiceMock();
  const auth = createAuth({
    secret: 'test-secret-that-is-at-least-32-characters',
    baseURL: TEST_ORIGIN,
    trustedOrigins: [TEST_ORIGIN],
    twoFactorIssuer: APP_NAME,
    passkey: { rpID: 'localhost', rpName: APP_NAME, origin: TEST_ORIGIN },
    mailer,
    signUpEnabled: true,
    hibpStatus: createHibpHealth({ enabled: false }),
    ...overrides,
    database: memoryAdapter(db),
  });

  // The request context the real mount runs in, so a test sees the locale an email is written in.
  const app = new Hono()
    .use(contextStorage())
    .use(requestLocale)
    .on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, (c) => auth.handler(c.req.raw))
    // A handler's error reaches the test instead of becoming a generic 500.
    .onError((error) => {
      throw error;
    });

  /** Calls the instance's handler at `/api/auth${path}` through the Hono mount. */
  const request: AuthRequest = async (path, { body, cookie, headers, method } = {}) => {
    const h = new Headers({ origin: TEST_ORIGIN });
    if (body !== undefined) h.set('content-type', 'application/json');
    if (cookie) h.set('cookie', cookie);
    for (const [name, value] of Object.entries(headers ?? {})) h.set(name, value);
    return app.fetch(
      new Request(`${TEST_ORIGIN}${AUTH_BASE_PATH}${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  };

  return { auth, db, mailer, request };
}
