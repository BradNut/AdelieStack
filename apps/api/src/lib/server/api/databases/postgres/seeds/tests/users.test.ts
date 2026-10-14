import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME, RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '#lib/server/api/auth/auth.config';
import seed from '#lib/server/api/databases/postgres/seeds/users';

const createUser = vi.fn();
const auth = { api: { createUser } } as unknown as Pick<Auth, 'api'>;

const createdEmails = () => createUser.mock.calls.map(([arg]) => arg.body.email);

beforeEach(() => {
  createUser.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('seed users', () => {
  it('skips the admin and warns when ADMIN_PASSWORD is missing', async () => {
    await seed(auth, { adminEmail: 'boss@example.com' });

    expect(createdEmails()).not.toContain('boss@example.com');
    expect(createUser.mock.calls.some(([arg]) => arg.body.role === RoleName.ADMIN)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
    expect(createUser).toHaveBeenCalled(); // sample users are still seeded
  });

  it('seeds the admin first, with the default email and name, when the password is set', async () => {
    await seed(auth, { adminPassword: 'secret-pass' });

    expect(createUser.mock.calls[0][0].body).toEqual({
      name: DEFAULT_ADMIN_NAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: 'secret-pass',
      role: RoleName.ADMIN,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('uses ADMIN_EMAIL when provided', async () => {
    await seed(auth, { adminEmail: 'boss@example.com', adminPassword: 'secret-pass' });

    expect(createdEmails()[0]).toBe('boss@example.com');
  });

  describe('closed sign-up with no admin password', () => {
    it('warns loudly, naming SIGN_UP_ENABLED and ADMIN_PASSWORD', async () => {
      await seed(auth, { signUpEnabled: false });

      const messages = vi.mocked(console.warn).mock.calls.map(([m]) => String(m));
      const loud = messages.find((m) => m.includes('SIGN_UP_ENABLED') && m.includes('ADMIN_PASSWORD'));
      expect(loud).toBeDefined();
      expect(loud).toMatch(/sign in/i);
    });

    it('still seeds the sample users without throwing', async () => {
      await expect(seed(auth, { signUpEnabled: false })).resolves.toBeUndefined();
      expect(createUser).toHaveBeenCalled();
    });

    it('keeps the ordinary warning only when sign-up is open', async () => {
      await seed(auth, { signUpEnabled: true });

      const messages = vi.mocked(console.warn).mock.calls.map(([m]) => String(m));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('ADMIN_PASSWORD');
      expect(messages[0]).not.toContain('SIGN_UP_ENABLED');
    });

    it('adds no extra warning when an admin password is set', async () => {
      await seed(auth, { signUpEnabled: false, adminPassword: 'secret-pass' });

      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
