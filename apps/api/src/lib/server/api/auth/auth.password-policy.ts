import { PASSWORD_COMPROMISED, PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from '@adelie/shared';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { isPasswordCompromised } from 'better-auth/plugins';

/** Better Auth endpoint paths that set a password. */
export const PasswordPolicyPath = {
  SIGN_UP: '/sign-up/email',
  RESET_PASSWORD: '/reset-password',
  CHANGE_PASSWORD: '/change-password',
  ADMIN_CREATE_USER: '/admin/create-user',
  ADMIN_SET_USER_PASSWORD: '/admin/set-user-password',
} as const;

/**
 * Request-body field holding the new password, per path. To enforce the policy on another
 * password-setting path, add its path to {@link PasswordPolicyPath} and its field here
 * (reset-password and change-password use `newPassword`, admin create-user uses `password`).
 */
const PASSWORD_FIELD_BY_PATH: Record<(typeof PasswordPolicyPath)[keyof typeof PasswordPolicyPath], string> = {
  [PasswordPolicyPath.SIGN_UP]: 'password',
  [PasswordPolicyPath.RESET_PASSWORD]: 'newPassword',
  [PasswordPolicyPath.CHANGE_PASSWORD]: 'newPassword',
  [PasswordPolicyPath.ADMIN_CREATE_USER]: 'password',
  [PasswordPolicyPath.ADMIN_SET_USER_PASSWORD]: 'newPassword',
};

const isPasswordPolicyPath = (path: string): path is keyof typeof PASSWORD_FIELD_BY_PATH => Object.hasOwn(PASSWORD_FIELD_BY_PATH, path);

/**
 * Paths whose breached-password screen runs here, before Better Auth acts, instead of in the
 * `haveIBeenPwned` plugin (which screens while hashing, too late on these two):
 * - admin create-user inserts the user before hashing, so a rejection would leave an account
 *   without credentials (better-auth/better-auth#11706);
 * - reset-password consumes the reset token before hashing, so a rejection would burn the link
 *   (better-auth/better-auth#10632, fixed on main but not in 1.7.7).
 */
const PRE_SCREENED_PATHS: readonly string[] = [PasswordPolicyPath.ADMIN_CREATE_USER, PasswordPolicyPath.RESET_PASSWORD];

/** Paths the `haveIBeenPwned` plugin screens itself; the rest are in {@link PRE_SCREENED_PATHS}. */
export const HIBP_PLUGIN_PATHS = [PasswordPolicyPath.SIGN_UP, PasswordPolicyPath.CHANGE_PASSWORD, PasswordPolicyPath.ADMIN_SET_USER_PASSWORD];

/**
 * Rejects non-compliant passwords with a bad request carrying the stable code and violated rules.
 * With `hibpEnabled`, also screens {@link PRE_SCREENED_PATHS} with the plugin's own check: a breached
 * password is `PASSWORD_COMPROMISED` and an unreachable HIBP rejects the request (fail closed).
 */
export const createPasswordPolicyHook = ({ hibpEnabled }: { hibpEnabled: boolean }) =>
  createAuthMiddleware(async (ctx) => {
    const field = isPasswordPolicyPath(ctx.path) ? PASSWORD_FIELD_BY_PATH[ctx.path] : undefined;
    if (!field) return;
    const password = (ctx.body as Record<string, unknown> | undefined)?.[field];
    // A missing or non-string password is Better Auth's own validation to reject.
    if (typeof password !== 'string') return;
    const rules = validatePasswordPolicy(password);
    if (rules.length > 0) {
      throw new APIError('BAD_REQUEST', { code: PASSWORD_POLICY_VIOLATION, message: PASSWORD_POLICY_VIOLATION, rules });
    }
    if (hibpEnabled && PRE_SCREENED_PATHS.includes(ctx.path) && (await isPasswordCompromised(password))) {
      throw new APIError('BAD_REQUEST', { code: PASSWORD_COMPROMISED, message: PASSWORD_COMPROMISED });
    }
  });
