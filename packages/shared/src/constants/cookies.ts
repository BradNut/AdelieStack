/** Attributes every cookie the API sets carries, unless it has a reason to differ. */
export const DEFAULT_COOKIE_ATTRIBUTES = {
  /** Not readable from browser scripts. */
  httpOnly: true,
  /** Sent on top-level navigations (so OAuth redirects keep the session) but not on cross-site subrequests. */
  sameSite: 'lax',
} as const;
