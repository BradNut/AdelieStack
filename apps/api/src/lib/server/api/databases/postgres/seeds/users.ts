import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME, RoleName } from '@adelie/shared';
import type { Auth } from '../../../auth/auth.config';
import users from './data/users.json';

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: RoleName;
}

export interface SeedUsersOptions {
  adminEmail?: string;
  adminPassword?: string;
  /** SIGN_UP_ENABLED. Defaults to closed, like the env setting, so an omitted value never hides the warning. */
  signUpEnabled?: boolean;
}

const NO_SIGN_IN_WARNING = [
  '!!! NOBODY WILL BE ABLE TO SIGN IN ON THIS INSTALL !!!',
  'SIGN_UP_ENABLED is false and ADMIN_PASSWORD is not set, so no admin is seeded and no one can register.',
  'Set ADMIN_PASSWORD (and re-seed) or set SIGN_UP_ENABLED=true.',
].join('\n');

/**
 * Seeds the admin from ADMIN_EMAIL / ADMIN_PASSWORD, then the sample users. The admin is
 * skipped, with a message, when ADMIN_PASSWORD is unset. Users are created through the admin
 * plugin's server-side `createUser`, the only path that may set a role.
 */
export default async function seed(auth: Pick<Auth, 'api'>, { adminEmail, adminPassword, signUpEnabled = false }: SeedUsersOptions = {}) {
  const seedUsers: SeedUser[] = [...(users as SeedUser[])];
  if (adminPassword) {
    seedUsers.unshift({
      name: DEFAULT_ADMIN_NAME,
      email: adminEmail || DEFAULT_ADMIN_EMAIL,
      password: adminPassword,
      role: RoleName.ADMIN,
    });
  } else {
    console.warn('ADMIN_PASSWORD is not set: skipping the admin user.');
    if (!signUpEnabled) {
      console.warn(NO_SIGN_IN_WARNING);
    }
  }

  console.log('Creating users ...');
  for (const user of seedUsers) {
    await auth.api.createUser({ body: user });
  }
  console.log('Users created.');
}
