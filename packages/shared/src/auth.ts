import type { RoleName } from './domain/role-name';

/** The signed-in user as the web app sees it: the Better Auth user, without server-only fields. */
export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role: RoleName;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}
