import { SocialProvider } from './social-providers';

/**
 * Values of Better Auth's last-login-method cookie. The plugin names a method after the endpoint that
 * signed the user in: `email` for password sign-in, `passkey`, or the provider id for social sign-in.
 */
export const LoginMethod = {
  PASSWORD: 'email',
  PASSKEY: 'passkey',
  ...SocialProvider,
} as const;
export type LoginMethod = (typeof LoginMethod)[keyof typeof LoginMethod];

export function isLoginMethod(value: unknown): value is LoginMethod {
  return (Object.values(LoginMethod) as unknown[]).includes(value);
}

/** Cookie the plugin sets (readable by the browser) so the login page can hint at the last method used. */
export const LAST_LOGIN_METHOD_COOKIE = 'better-auth.last_used_login_method';
