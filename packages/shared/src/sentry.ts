import { isDevelopmentEnvironment } from './constants/environment';

/**
 * Spotlight and default PII are development-only so they never reach staging or production. Sentry starts before the
 * env is validated, so this fails closed: only an explicit `development` turns them on, unset or unknown turns them off.
 */
export function getDevOnlySentryOptions(environment: string | undefined) {
  const isDevelopment = isDevelopmentEnvironment(environment);
  return { spotlight: isDevelopment, sendDefaultPii: isDevelopment };
}
