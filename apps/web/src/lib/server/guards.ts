import { AppRoute, type AuthedUser, type RoleName, StatusCodes } from '@adelie/shared';
import { error, type RequestEvent } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { evaluateRouteAccess, RouteAccess } from '#lib/auth/guards.ts';
import { forbiddenMessage, notSignedInMessage, secondFactorRequiredMessage } from '#lib/utils/flashMessages.ts';

/**
 * Throws unless the request's user may open the route: a redirect to sign in when signed out,
 * a 403 when signed in without one of `roles`, and a redirect to two-factor enrolment (where passkeys are linked too)
 * when the role needs a Second Factor the account lacks (ADR 0014). Returns the user otherwise.
 */
export function requireUser(event: RequestEvent, roles?: readonly RoleName[]): AuthedUser {
  const access = evaluateRouteAccess(event.locals.user, roles);
  if (access === RouteAccess.SIGN_IN) {
    throw redirect(StatusCodes.TEMPORARY_REDIRECT, '/login', notSignedInMessage, event);
  }
  if (access === RouteAccess.ENROL_SECOND_FACTOR) {
    throw redirect(StatusCodes.TEMPORARY_REDIRECT, AppRoute.SETTINGS_TWO_FACTOR, secondFactorRequiredMessage, event);
  }
  if (access === RouteAccess.FORBIDDEN || !event.locals.user) {
    error(StatusCodes.FORBIDDEN, forbiddenMessage.message);
  }
  return event.locals.user;
}
