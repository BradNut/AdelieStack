import type { DBFieldAttribute } from 'better-auth';
import { z } from 'zod';
import { getRequestLocale, isLocale, type Locale, locales } from '#lib/server/api/common/i18n/index';
import type { UserCreateBefore } from './auth.database-hooks';
import { AuthEndpoint } from './auth.endpoints';

/** Where an account holder creates their own account, so the request's language is theirs. */
const SELF_SIGN_UP_PATHS: ReadonlySet<string> = new Set([AuthEndpoint.SIGN_UP_EMAIL, AuthEndpoint.SIGN_IN_SOCIAL, AuthEndpoint.SOCIAL_CALLBACK]);

/**
 * `user.additionalFields` entry for the Preferred Language: the locale every email to the account is written in.
 * `null` means none, so mail follows the Request Locale. Only a supported locale (or `null`) can be written; the
 * account holder saves it through update-user, which needs no fresh session and sends no Security Event email.
 */
export const preferredLanguageField = {
  type: 'string',
  required: false,
  input: true,
  validator: { input: z.enum(locales).nullable() },
} satisfies DBFieldAttribute;

/**
 * The slice of a user the mail locale is chosen from. `locale` is whatever the row holds, which may be a value a later
 * catalogue no longer supports; Better Auth's own user types do not declare it at all.
 */
export interface PreferredLanguageHolder {
  id: string;
  locale?: unknown;
}

/**
 * The locale an email to `user` is written in: the Preferred Language, else the Request Locale (which falls back to
 * `en`). A stored value that is no longer a supported locale counts as no preference; the row is left as it is.
 *
 * The preference wins because the request is not always the account holder's: an attacker changing the account, or
 * the browser that opened an email-change link, must not choose the language of the owner's warning.
 */
export function mailLocale(user: PreferredLanguageHolder): Locale {
  return isLocale(user.locale) ? user.locale : getRequestLocale();
}

/**
 * `databaseHooks.user.create.before`: a self or social sign-up saves its Request Locale as the Preferred Language, so
 * the account starts in the language it was created in; a locale in the body does not override it. Every other way a
 * user is created (an admin, the seed) leaves it `null`: that request carries the creator's language, not the account
 * holder's. Existing accounts are not backfilled.
 */
export const seedPreferredLanguage: UserCreateBefore = async (user, context) => {
  const locale = context?.path && SELF_SIGN_UP_PATHS.has(context.path) ? getRequestLocale() : null;
  return { data: { ...user, locale } };
};
