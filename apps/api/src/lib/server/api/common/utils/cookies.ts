/** Whether `url` is an https URL; anything unparseable is not. */
export function isHttpsUrl(url: string): boolean {
  return URL.parse(url)?.protocol === 'https:';
}

/**
 * The one rule for the `Secure` cookie flag: every cookie the API sets is `Secure` exactly when the auth base URL
 * (`BETTER_AUTH_URL`, the public web origin) is https. Better Auth's cookies and the browser-session cookie both follow it.
 */
export function usesSecureCookies(baseURL: string): boolean {
  return isHttpsUrl(baseURL);
}
