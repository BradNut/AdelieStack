export interface Role {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface AuthedUser {
  id: string;
  email?: string;
  username?: string;
  avatar?: string | null;
  roles: Role[];
  hasTOTPEnabled: boolean;
  hasPasskeyEnabled: boolean;
  hasSecurityKeyEnabled: boolean;
  [key: string]: unknown;
}
