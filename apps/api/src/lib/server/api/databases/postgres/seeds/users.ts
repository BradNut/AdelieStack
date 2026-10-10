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
}

/**
 * Seeds the admin from ADMIN_EMAIL / ADMIN_PASSWORD, then the sample users. The admin is
 * skipped, with a message, when ADMIN_PASSWORD is unset. Users are created through the admin
 * plugin's server-side `createUser`, the only path that may set a role.
 */
export default async function seed(auth: Pick<Auth, 'api'>, { adminEmail, adminPassword }: SeedUsersOptions = {}) {
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
  }

  console.log('Creating users ...');
  for (const user of seedUsers) {
    await auth.api.createUser({ body: user });
  }
  console.log('Users created.');
}
