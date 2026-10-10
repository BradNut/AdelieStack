/** Spotlight and default PII are dev-only so they never reach staging or production. */
export function getDevOnlySentryOptions(environment: string | undefined) {
  const isDevelopment = (environment ?? 'development') === 'development';
  return { spotlight: isDevelopment, sendDefaultPii: isDevelopment };
}
