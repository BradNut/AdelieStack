import { RoleName } from '@adelie/shared';
import type { Auth } from '../../../auth/auth.config';
import users from './data/users.json';

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';

type SeedUser = { name: string; email: string; password: string; role: RoleName };

/**
 * Seeds the admin from ADMIN_EMAIL / ADMIN_PASSWORD, then the sample users. Users are created
 * through the admin plugin's server-side `createUser`, the only path that may set a role.
 */
export default async function seed(auth: Auth) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD must be set to seed the admin user');
  }
  const admin: SeedUser = {
    name: 'Admin',
    email: process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
    password: adminPassword,
    role: RoleName.ADMIN,
  };

  console.log('Creating users ...');
  for (const user of [admin, ...(users as SeedUser[])]) {
    await auth.api.createUser({ body: user });
  }
  console.log('Users created.');
}
