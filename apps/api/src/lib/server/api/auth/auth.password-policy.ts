import { PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from '@adelie/shared';
import { APIError, createAuthMiddleware } from 'better-auth/api';

/** Better Auth endpoint paths that set a password. */
export const PasswordPolicyPath = {
  SIGN_UP: '/sign-up/email',
  ADMIN_CREATE_USER: '/admin/create-user',
  ADMIN_SET_USER_PASSWORD: '/admin/set-user-password',
} as const;

/**
 * Request-body field holding the new password, per path. To enforce the policy on another
 * password-setting path, add its path to {@link PasswordPolicyPath} and its field here
 * (reset-password and change-password use `newPassword`, admin create-user uses `password`).
 */
const PASSWORD_FIELD_BY_PATH: Record<string, string> = {
  [PasswordPolicyPath.SIGN_UP]: 'password',
  [PasswordPolicyPath.ADMIN_CREATE_USER]: 'password',
  [PasswordPolicyPath.ADMIN_SET_USER_PASSWORD]: 'newPassword',
};

/** Rejects non-compliant passwords with a bad request carrying the stable code and violated rules. */
export const passwordPolicyHook = createAuthMiddleware(async (ctx) => {
  const field = PASSWORD_FIELD_BY_PATH[ctx.path];
  if (!field) return;
  const password = (ctx.body as Record<string, unknown> | undefined)?.[field];
  // A missing or non-string password is Better Auth's own validation to reject.
  if (typeof password !== 'string') return;
  const rules = validatePasswordPolicy(password);
  if (rules.length === 0) return;
  throw new APIError('BAD_REQUEST', { code: PASSWORD_POLICY_VIOLATION, message: PASSWORD_POLICY_VIOLATION, rules });
});
