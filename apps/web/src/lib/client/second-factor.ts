import { AppRoute, AuthErrorCode } from '@adelie/shared';
import { goto } from '$app/navigation';

/** The part of an API or Better Auth client error this reads. */
interface CodedError {
  status?: number;
  code?: string;
}

/**
 * Sends the user to two-factor enrolment (which links to passkeys) when an admin capability was refused for want of a
 * Second Factor (ADR 0014). Returns whether it did, so the caller shows its own error otherwise.
 */
export async function sendToSecondFactorEnrolment(error: CodedError | null | undefined): Promise<boolean> {
  if (error?.code !== AuthErrorCode.SECOND_FACTOR_REQUIRED) return false;
  await goto(AppRoute.SETTINGS_TWO_FACTOR);
  return true;
}
