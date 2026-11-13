/** Forwarding headers a proxy may leave client-controlled, so they must never set the client IP. */
export const IGNORED_CLIENT_IP_HEADERS = ['x-real-ip', 'cf-connecting-ip'] as const;
