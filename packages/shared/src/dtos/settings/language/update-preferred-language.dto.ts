import { z } from 'zod';

/** The form value for "Match my browser": no Preferred Language, saved as `null`. */
export const MATCH_MY_BROWSER = '';

/**
 * The language picker. `preferredLanguage` is a locale code or {@link MATCH_MY_BROWSER}. Supported locales are not
 * listed here (each app owns its catalogue): the web only offers its own, and the API refuses any it does not support.
 */
export const updatePreferredLanguageDto = z.object({
  preferredLanguage: z.string(),
});

export type UpdatePreferredLanguageDto = z.infer<typeof updatePreferredLanguageDto>;
