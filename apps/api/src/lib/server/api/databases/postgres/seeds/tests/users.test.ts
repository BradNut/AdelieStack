import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME, RoleName } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../../../auth/auth.config';
import seed from '../users';

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
});
