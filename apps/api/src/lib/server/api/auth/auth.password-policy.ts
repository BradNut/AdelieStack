import { PASSWORD_COMPROMISED, PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from '@adelie/shared';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { isPasswordCompromised } from 'better-auth/plugins';
import { AuthEndpoint } from './auth.endpoints';
import { passwordCheckUnavailable } from './auth.hibp-status';
import type { ProviderHealth } from './auth.provider-health';

/** Where a path's new password is screened against Have I Been Pwned. */
const HibpScreen = {
  /** The `haveIBeenPwned` plugin, while hashing. */
  PLUGIN: 'plugin',
  /**
   * The before-hook here, before Better Auth acts, because the plugin screens too late:
   * - admin create-user inserts the user before hashing, so a rejection would leave an account
   *   without credentials (better-auth/better-auth#11706);
   * - reset-password: Better Auth 1.7.8 no longer burns the reset link on a rejected password
   *   (better-auth/better-auth#10632); it stays here so a breached or unscreenable password is
   *   rejected with the same codes as the other paths, before any token or session work.
   */
  BEFORE_HOOK: 'before-hook',
} as const;

/**
 * Every Better Auth path that sets a password: the request-body field holding it, and who screens it. To enforce the
 * policy on another path, add it here; a path cannot be left unscreened.
 */
const PASSWORD_PATHS: Record<string, { field: string; hibpScreen: (typeof HibpScreen)[keyof typeof HibpScreen] }> = {
  [AuthEndpoint.SIGN_UP_EMAIL]: { field: 'password', hibpScreen: HibpScreen.PLUGIN },
  [AuthEndpoint.CHANGE_PASSWORD]: { field: 'newPassword', hibpScreen: HibpScreen.PLUGIN },
  [AuthEndpoint.ADMIN_SET_USER_PASSWORD]: { field: 'newPassword', hibpScreen: HibpScreen.PLUGIN },
  [AuthEndpoint.RESET_PASSWORD]: { field: 'newPassword', hibpScreen: HibpScreen.BEFORE_HOOK },
  [AuthEndpoint.ADMIN_CREATE_USER]: { field: 'password', hibpScreen: HibpScreen.BEFORE_HOOK },
};

/** Paths the `haveIBeenPwned` plugin screens itself. */
export const HIBP_PLUGIN_PATHS = Object.keys(PASSWORD_PATHS).filter((path) => PASSWORD_PATHS[path].hibpScreen === HibpScreen.PLUGIN);

/** Runs the plugin's own check, recording the outcome; an outage becomes a 503 with the stable unavailable code. */
async function checkPasswordCompromised(password: string, hibpStatus: ProviderHealth): Promise<boolean> {
  try {
    const compromised = await isPasswordCompromised(password);
    hibpStatus.recordSuccess();
    return compromised;
  } catch (error) {
    hibpStatus.recordFailure(error);
    throw passwordCheckUnavailable();
  }
}

/**
 * Rejects non-compliant passwords with a bad request carrying the stable code and violated rules.
 * With screening enabled on `hibpStatus`, also screens the {@link HibpScreen.BEFORE_HOOK} paths with the plugin's own check: a breached
 * password is `PASSWORD_COMPROMISED` and an unreachable HIBP rejects the request (fail closed, as a 503 `PASSWORD_CHECK_UNAVAILABLE`).
 */
export const createPasswordPolicyHook = (hibpStatus: ProviderHealth): ReturnType<typeof createAuthMiddleware> =>
  createAuthMiddleware(async (ctx) => {
    const passwordPath = Object.hasOwn(PASSWORD_PATHS, ctx.path) ? PASSWORD_PATHS[ctx.path] : undefined;
    if (!passwordPath) return;
    const password = (ctx.body as Record<string, unknown> | undefined)?.[passwordPath.field];
    // A missing or non-string password is Better Auth's own validation to reject.
    if (typeof password !== 'string') return;
    const rules = validatePasswordPolicy(password);
    if (rules.length > 0) {
      throw new APIError('BAD_REQUEST', { code: PASSWORD_POLICY_VIOLATION, message: PASSWORD_POLICY_VIOLATION, rules });
    }
    if (hibpStatus.enabled && passwordPath.hibpScreen === HibpScreen.BEFORE_HOOK && (await checkPasswordCompromised(password, hibpStatus))) {
      throw new APIError('BAD_REQUEST', { code: PASSWORD_COMPROMISED, message: PASSWORD_COMPROMISED });
    }
  });
