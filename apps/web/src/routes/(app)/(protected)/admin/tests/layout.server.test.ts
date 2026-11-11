// @vitest-environment jsdom
// Vitest resolves the browser export condition (vite.config.ts), so Kit 3's redirect() takes its client build, which reads `window`.
import { AppRoute, type AuthedUser, RoleName, SECOND_FACTOR_REQUIRED_MESSAGE } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import { load } from '../+layout.server';

const authedUser = (overrides: Partial<AuthedUser> = {}): AuthedUser => ({
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  roles: [RoleName.ADMIN],
  emailVerified: true,
  twoFactorEnabled: false,
  needsSecondFactor: false,
  ...overrides,
});

function event(user: AuthedUser | null) {
  return {
    locals: { user },
    cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn(), getAll: vi.fn(() => []) },
    url: new URL('http://localhost/admin'),
    request: new Request('http://localhost/admin'),
  } as unknown as Parameters<typeof load>[0];
}

async function thrownBy(run: () => unknown) {
  try {
    await run();
  } catch (thrown) {
    return thrown as { status: number; location?: string };
  }
  return null;
}

describe('/admin layout load', () => {
  it('sends an admin without a Second Factor to two-factor enrolment, not an error page', async () => {
    const thrown = await thrownBy(() => load(event(authedUser({ needsSecondFactor: true }))));

    // The same status as the sign-in redirect beside it.
    expect(thrown?.status).toBe(307);
    expect(thrown?.location).toBe(AppRoute.SETTINGS_TWO_FACTOR);
  });

  it('flashes why the admin was sent to enrolment', async () => {
    const e = event(authedUser({ needsSecondFactor: true }));
    await thrownBy(() => load(e));

    const [, value] = vi.mocked(e.cookies.set).mock.calls[0];
    expect(decodeURIComponent(String(value))).toContain(SECOND_FACTOR_REQUIRED_MESSAGE);
  });

  it('lets an admin with a Second Factor in', async () => {
    expect(await thrownBy(() => load(event(authedUser({ twoFactorEnabled: true }))))).toBeNull();
  });

  it.each([RoleName.SUPPORT, RoleName.USER])('still refuses a %s with 403', async (role) => {
    const thrown = await thrownBy(() => load(event(authedUser({ roles: [role] }))));

    expect(thrown?.status).toBe(403);
  });
});
