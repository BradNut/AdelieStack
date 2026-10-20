/** Web app pages that components link to or navigate to. */
export const AppRoute = {
  HOME: '/',
  LOGIN: '/login',
  /** Where password sign-in continues when the account has two-factor enabled. */
  LOGIN_TWO_FACTOR: '/login/two-factor',
  SIGNUP: '/signup',
  SETTINGS: '/settings',
  SETTINGS_EMAIL: '/settings/email',
  SETTINGS_PASSWORD: '/settings/password',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_TWO_FACTOR: '/settings/two-factor',
  SETTINGS_PASSKEYS: '/settings/passkeys',
  SETTINGS_CONNECTED_ACCOUNTS: '/settings/connected-accounts',
} as const;

/** Query parameter on the sign-in pages naming the app-internal page to return to once signed in. */
export const RETURN_TO_PARAM = 'returnTo';
