import { type AuthedUser, type RoleName, StatusCodes } from '@adelie/shared';
import { error, type RequestEvent } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { evaluateRouteAccess, RouteAccess } from '$lib/auth/guards';
import { forbiddenMessage, notSignedInMessage } from '$lib/utils/flashMessages';

/**
 * Throws unless the request's user may open the route: a redirect to sign in when signed out,
 * a 403 when signed in without one of `roles`. Returns the user otherwise.
 */
export function requireUser(event: RequestEvent, roles?: readonly RoleName[]): AuthedUser {
  const access = evaluateRouteAccess(event.locals.user, roles);
  if (access === RouteAccess.SIGN_IN) {
    throw redirect(StatusCodes.TEMPORARY_REDIRECT, '/login', notSignedInMessage, event);
  }
  if (access === RouteAccess.FORBIDDEN || !event.locals.user) {
    error(StatusCodes.FORBIDDEN, forbiddenMessage.message);
  }
  return event.locals.user;
}
