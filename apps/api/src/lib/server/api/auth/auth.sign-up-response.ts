import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { AuthEndpoint } from './auth.endpoints';

/** The body of every accepted email sign-up, whether the address was new or already taken. */
export const SIGN_UP_ACCEPTED_BODY = { status: true } as const;

/**
 * Answers every accepted email sign-up with {@link SIGN_UP_ACCEPTED_BODY}. With `requireEmailVerification` Better Auth
 * already answers a taken address with 200 and no session, but its stand-in user differs from a real new one (a null
 * `role`, extra null fields, another key order), which would show a caller that the address has an account. A
 * rejected sign-up (closed, bad password, captcha, rate limit) keeps its error: it says nothing about the address.
 */
const uniformAnswer = createAuthMiddleware(async (ctx) => {
  if (isAPIError(ctx.context.returned)) return;
  return ctx.json(SIGN_UP_ACCEPTED_BODY);
});

export const uniformSignUpResponse = (): BetterAuthPlugin => ({
  id: 'uniform-sign-up-response',
  hooks: { after: [{ matcher: (ctx) => ctx.path === AuthEndpoint.SIGN_UP_EMAIL, handler: uniformAnswer }] },
});
