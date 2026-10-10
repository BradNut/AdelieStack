import { z } from 'zod';
import { RECOVERY_CODE_LENGTH, TOTP_CODE_LENGTH } from '../../constants/mfa-limits';

/** A 6-digit code from an authenticator app or the emailed one-time code. */
export const twoFactorCodeDto = z.object({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`), { message: `Enter the ${TOTP_CODE_LENGTH}-digit code` }),
});

export type TwoFactorCodeDto = z.infer<typeof twoFactorCodeDto>;

/** A single-use recovery code, e.g. `abcde-fghij`. */
export const recoveryCodeDto = z.object({
  code: z
    .string()
    .trim()
    .min(RECOVERY_CODE_LENGTH, { message: 'Enter a recovery code' })
    .max(RECOVERY_CODE_LENGTH + 1, { message: 'Enter a recovery code' }),
});

export type RecoveryCodeDto = z.infer<typeof recoveryCodeDto>;
