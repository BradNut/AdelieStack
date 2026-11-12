import { LAST_LOGIN_METHOD_COOKIE, LoginMethod } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import { type AuthRequest, signUpWithEmail, TEST_USER } from '../../../../../test/auth-http';
import { createTestAuth } from '../../../../../test/auth-instance';

const { email: EMAIL, password: PASSWORD } = TEST_USER;

let auth: Auth;
let request: AuthRequest;

/** The last-login-method cookie a response sets, or undefined when it sets none. */
function lastLoginCookie(res: Response): string | undefined {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${LAST_LOGIN_METHOD_COOKIE}=`));
  return header?.split(';')[0]?.slice(LAST_LOGIN_METHOD_COOKIE.length + 1);
}

beforeEach(() => {
  ({ auth, request } = createTestAuth());
});

describe('last login method cookie', () => {
  it('records password sign-in', async () => {
    await signUpWithEmail(request, TEST_USER);

    const res = await request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(lastLoginCookie(res)).toBe(LoginMethod.PASSWORD);
  });

  it('is readable by the browser and lives beyond the session', async () => {
    await signUpWithEmail(request, TEST_USER);
    const res = await request('/sign-in/email', { body: { email: EMAIL, password: PASSWORD } });

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${LAST_LOGIN_METHOD_COOKIE}=`));

    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/httponly/i);
    expect(cookie).toMatch(/max-age=\d+/i);
  });

  it('sets nothing when the sign-in fails', async () => {
    await signUpWithEmail(request, TEST_USER);

    const res = await request('/sign-in/email', { body: { email: EMAIL, password: 'Wrong-horse-9!' } });

    expect(res.status).toBe(401);
    expect(lastLoginCookie(res)).toBeUndefined();
  });

  it('stores nothing on the user row (no schema change)', () => {
    const plugin = auth.options.plugins.find((p) => p.id === 'last-login-method');

    expect(plugin).toBeDefined();
    expect(plugin && 'schema' in plugin ? plugin.schema : undefined).toBeUndefined();
  });
});
