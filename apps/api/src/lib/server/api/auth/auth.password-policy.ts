import { PASSWORD_POLICY_VIOLATION, validatePasswordPolicy } from '@adelie/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { haveIBeenPwned } from 'better-auth/plugins';
import { AuthEndpoint } from './auth.endpoints';
import { hibpMonitor } from './auth.hibp-status';
import type { ProviderHealth } from './auth.provider-health';

/**
 * Every Better Auth path that sets a password, with the request-body field holding it. Each is checked against the
 * policy by {@link passwordPolicyHook} and screened against Have I Been Pwned by {@link hibpScreening}. To enforce
 * both on another path, add it here; a path cannot be left unscreened.
 */
const PASSWORD_PATHS: Record<string, { field: string }> = {
  [AuthEndpoint.SIGN_UP_EMAIL]: { field: 'password' },
  [AuthEndpoint.CHANGE_PASSWORD]: { field: 'newPassword' },
  [AuthEndpoint.ADMIN_SET_USER_PASSWORD]: { field: 'newPassword' },
  [AuthEndpoint.RESET_PASSWORD]: { field: 'newPassword' },
  [AuthEndpoint.ADMIN_CREATE_USER]: { field: 'password' },
};

/**
 * Screening while hashing. `haveIBeenPwned` rejects breached passwords (`PASSWORD_COMPROMISED`) and fails closed when
 * HIBP is unreachable; with `enabled: false` it makes no HIBP request on any path. `hibpMonitor` must come after it,
 * because it wraps that plugin's hashing to record each check's outcome and turn an outage into a 503.
 * Better Auth hashes before writing anything: admin create-user creates no user on a rejection (since 1.7.19,
 * better-auth/better-auth#11706) and reset-password leaves the link usable (since 1.7.8, better-auth/better-auth#10632).
 */
export const hibpScreening = (status: ProviderHealth): BetterAuthPlugin[] => [
  haveIBeenPwned({ enabled: status.enabled, paths: Object.keys(PASSWORD_PATHS) }),
  hibpMonitor(status),
];

/** Rejects non-compliant passwords with a bad request carrying the stable code and violated rules. */
export const passwordPolicyHook: ReturnType<typeof createAuthMiddleware> = createAuthMiddleware(async (ctx) => {
  const passwordPath = Object.hasOwn(PASSWORD_PATHS, ctx.path) ? PASSWORD_PATHS[ctx.path] : undefined;
  if (!passwordPath) return;
  const password = (ctx.body as Record<string, unknown> | undefined)?.[passwordPath.field];
  // A missing or non-string password is Better Auth's own validation to reject.
  if (typeof password !== 'string') return;
  const rules = validatePasswordPolicy(password);
  if (rules.length > 0) {
    throw new APIError('BAD_REQUEST', { code: PASSWORD_POLICY_VIOLATION, message: PASSWORD_POLICY_VIOLATION, rules });
  }
});
