import { isRecord } from '#lib/server/api/common/utils/is-record';

/** The two-factor plugin's answer once a sign-in needs a challenge: the new session is already gone. */
export function isTwoFactorRedirect(returned: unknown): boolean {
  return isRecord(returned) && returned.twoFactorRedirect === true;
}
