import { RoleName } from '@adelie/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Api } from '#lib/utils/types.ts';
import { hasSessionCookie, loadSessionUser, toAuthedUser } from '../session-user';

const apiUser = {
  id: 'u1',
  email: 'a@example.com',
  name: 'A',
  image: null,
  roles: [RoleName.ADMIN],
  emailVerified: true,
  twoFactorEnabled: true,
  banned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function apiReturning(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const get = vi.fn().mockResolvedValue(response);
  return { api: { users: { me: { $get: get } } } as unknown as Api, get };
}

describe('toAuthedUser', () => {
  it('keeps only the fields the web app needs', () => {
    expect(toAuthedUser(apiUser)).toEqual({
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      image: null,
      roles: [RoleName.ADMIN],
      emailVerified: true,
      twoFactorEnabled: true,
    });
  });

  it('passes the API roles through unchanged', () => {
    expect(toAuthedUser({ ...apiUser, roles: [RoleName.USER, RoleName.SUPPORT] }).roles).toEqual([RoleName.USER, RoleName.SUPPORT]);
  });

  it('defaults a missing twoFactorEnabled to false', () => {
    expect(toAuthedUser({ ...apiUser, twoFactorEnabled: null }).twoFactorEnabled).toBe(false);
  });
});

describe('hasSessionCookie', () => {
  it('detects the Better Auth session cookie, with or without the secure prefix', () => {
    expect(hasSessionCookie('theme=dark; better-auth.session_token=abc')).toBe(true);
    expect(hasSessionCookie('__Secure-better-auth.session_token=abc')).toBe(true);
  });

  it('is false for other cookies or none', () => {
    expect(hasSessionCookie('theme=dark')).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});

describe('loadSessionUser', () => {
  it('skips the API call when there is no session cookie', async () => {
    const { api, get } = apiReturning({ ok: true, json: async () => apiUser });

    expect(await loadSessionUser(api, 'theme=dark')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the narrowed user for a valid session', async () => {
    const { api } = apiReturning({ ok: true, json: async () => apiUser });

    expect((await loadSessionUser(api, 'better-auth.session_token=abc'))?.roles).toEqual([RoleName.ADMIN]);
  });

  it('returns null when the API reports no user or an error', async () => {
    expect(await loadSessionUser(apiReturning({ ok: true, json: async () => null }).api, 'better-auth.session_token=abc')).toBeNull();
    expect(await loadSessionUser(apiReturning({ ok: false }).api, 'better-auth.session_token=abc')).toBeNull();
  });
});
