import type { AuthedUser } from '@adelie/shared';
import type { InferResponseType } from 'hono/client';
import type { Api } from '#lib/utils/types.js';

/** Better Auth names its session cookie `<prefix>.session_token`, with a `__Secure-` prefix over https. */
const SESSION_COOKIE_MARKER = 'session_token';

/** The signed-in user as `/users/me` returns it, typed by the shared API contract. */
type SessionUserResponse = NonNullable<InferResponseType<Api['users']['me']['$get'], 200>>;

/** Narrows the API's user to what the web app needs. */
export function toAuthedUser(user: SessionUserResponse): AuthedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    roles: user.roles,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
  };
}

/** Whether the request carries a session cookie, so signed-out requests skip the API call. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  return !!cookieHeader?.includes(SESSION_COOKIE_MARKER);
}

/** Reads the signed-in user from the API, or null when signed out or the session is invalid. */
export async function loadSessionUser(api: Api, cookieHeader: string | null): Promise<AuthedUser | null> {
  if (!hasSessionCookie(cookieHeader)) return null;
  const response = await api.users.me.$get();
  if (!response.ok) return null;
  const user = await response.json();
  return user ? toAuthedUser(user) : null;
}
