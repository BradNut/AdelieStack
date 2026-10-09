import type { RoleName } from './domain/role-name';

export interface AuthedUser {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  role: RoleName;
  hasTOTPEnabled: boolean;
  hasPasskeyEnabled: boolean;
  hasSecurityKeyEnabled: boolean;
  [key: string]: unknown;
}
