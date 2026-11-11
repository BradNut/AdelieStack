/** Response headers both the web app and the API set, so the protections do not depend on a reverse proxy adding them. */
export const SecurityHeader = {
  CONTENT_TYPE_OPTIONS: 'x-content-type-options',
  REFERRER_POLICY: 'referrer-policy',
  PERMISSIONS_POLICY: 'permissions-policy',
  STRICT_TRANSPORT_SECURITY: 'strict-transport-security',
} as const;

/**
 * Powerful features the app never uses, denied to the page and every frame it embeds. Deliberately absent, so they keep
 * their `self` default: `publickey-credentials-get`/`-create` (passkeys), `identity-credentials-get` (federated sign-in)
 * and the `private-state-token-*` features captcha widgets may use.
 */
const DENIED_FEATURES = [
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
  'serial',
  'hid',
  'bluetooth',
  'midi',
  'display-capture',
  'accelerometer',
  'gyroscope',
  'magnetometer',
] as const;

/** Sent on every response, whatever the scheme. */
export const BASELINE_SECURITY_HEADERS = {
  [SecurityHeader.CONTENT_TYPE_OPTIONS]: 'nosniff',
  // Cross-origin requests (captcha frames, OAuth providers) still see the origin, never the path or query.
  [SecurityHeader.REFERRER_POLICY]: 'strict-origin-when-cross-origin',
  [SecurityHeader.PERMISSIONS_POLICY]: DENIED_FEATURES.map((feature) => `${feature}=()`).join(', '),
} as const;

/**
 * One year, for this host only: `includeSubDomains` and `preload` would bind sibling hosts the template knows nothing
 * about. Browsers ignore the header over http (RFC 6797); it is only sent over https anyway.
 */
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000';

/** The header a reverse proxy sets to the scheme the client used; the API reads it only with TRUST_PROXY. */
export const FORWARDED_PROTO_HEADER = 'x-forwarded-proto';

export type SecurityHeaderOptions = {
  /** Whether the client reached us over https; HSTS is sent only then. */
  overHttps: boolean;
};

/**
 * Sets the security headers on `headers`: the baseline always, HSTS only when the client reached us over https. Over http
 * an HSTS header already present (from the upstream API) is removed: the caller knows the scheme the browser used.
 */
function applySecurityHeaders(headers: Headers, { overHttps }: SecurityHeaderOptions): void {
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (overHttps) headers.set(SecurityHeader.STRICT_TRANSPORT_SECURITY, STRICT_TRANSPORT_SECURITY);
  else headers.delete(SecurityHeader.STRICT_TRANSPORT_SECURITY);
}

/**
 * Returns `response` with the security headers set (see {@link applySecurityHeaders}). A response with immutable headers
 * (one passed straight through from `fetch`) is copied, status, headers and body kept, so it can carry them too.
 */
export function withSecurityHeaders(response: Response, options: SecurityHeaderOptions): Response {
  try {
    applySecurityHeaders(response.headers, options);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    applySecurityHeaders(copy.headers, options);
    return copy;
  }
}
