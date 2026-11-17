import type { DBFieldAttribute } from 'better-auth';
import { z } from 'zod';
import { getRequestLocale, type Locale, locales } from '#lib/server/api/common/i18n/index';

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

/** The slice of a user the mail locale is chosen from. */
export interface PreferredLanguageHolder {
  locale?: string | null;
}

function isSupportedLocale(value: unknown): value is Locale {
  return (locales as readonly unknown[]).includes(value);
}

/**
 * The locale an email to `user` is written in: the Preferred Language, else the Request Locale (which falls back to
 * `en`). A stored value that is no longer a supported locale counts as no preference; the row is left as it is.
 *
 * The preference wins because the request is not always the account holder's: an attacker changing the account, or
 * the browser that opened an email-change link, must not choose the language of the owner's warning.
 */
export function mailLocale(user: PreferredLanguageHolder): Locale {
  return isSupportedLocale(user.locale) ? user.locale : getRequestLocale();
}
