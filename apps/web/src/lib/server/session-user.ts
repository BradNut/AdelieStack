import { type AuthedUser, RoleName } from '@adelie/shared';
import type { Api } from '$lib/utils/types';

/** Better Auth names its session cookie `<prefix>.session_token`, with a `__Secure-` prefix over https. */
const SESSION_COOKIE_MARKER = 'session_token';

const KNOWN_ROLES: readonly string[] = Object.values(RoleName);

interface SessionUserResponse {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean | null;
}

/** Narrows the API's user to what the web app needs. An unknown or missing role falls back to the least privileged one. */
export function toAuthedUser(user: SessionUserResponse): AuthedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    role: KNOWN_ROLES.includes(user.role ?? '') ? (user.role as AuthedUser['role']) : RoleName.USER,
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
  const user = (await response.json()) as SessionUserResponse | null;
  return user ? toAuthedUser(user) : null;
}
