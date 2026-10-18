/** Seconds in a minute, for durations Better Auth takes in seconds. */
export const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 24 * 60 * 60;

/** A session lasts this long (seconds) after its last refresh: 7 days. */
export const AUTH_SESSION_EXPIRES_IN = 7 * SECONDS_PER_DAY;

/** An active session is extended (seconds) at most this often: once a day. */
export const AUTH_SESSION_UPDATE_AGE = 1 * SECONDS_PER_DAY;

/**
 * A session counts as fresh (seconds) for this long after sign-in. Sensitive actions (delete user,
 * change email, ...) refuse an older session until the user re-authenticates: 5 minutes.
 */
export const AUTH_SESSION_FRESH_AGE = 5 * SECONDS_PER_MINUTE;

/**
 * Header the client IP is read from when the API runs behind a trusted proxy (`TRUST_PROXY`).
 * Without a trusted proxy no header is read at all, so a client cannot spoof its address.
 */
export const AUTH_CLIENT_IP_HEADER = 'x-forwarded-for';
