/** `requestType` Better Auth puts in the token it emails to the new address of an email change. */
export const CHANGE_EMAIL_REQUEST_TYPE = 'change-email-verification';

export interface VerificationTokenPayload {
  /** The address the token was issued for; for an email change, the current (old) address. */
  email?: string;
  updateTo?: string;
  requestType?: string;
}

/**
 * Reads the claims of a Better Auth verification token without checking its signature. Only use
 * it to pick an email template or after the verify endpoint itself has accepted the token.
 */
export function readVerificationToken(token: string | undefined): VerificationTokenPayload | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as VerificationTokenPayload;
  } catch {
    return null;
  }
}
