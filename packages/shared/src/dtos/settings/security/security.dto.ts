import { z } from 'zod';
import { MAX_NAME_LENGTH } from '../../../constants/auth-limits';

/** Re-entering the account password before a sensitive two-factor change. */
export const passwordConfirmDto = z.object({
  password: z.string().min(1, { message: 'Password is required' }),
});

export type PasswordConfirmDto = z.infer<typeof passwordConfirmDto>;

/** Optional label for a new passkey or security key. */
export const passkeyNameDto = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, { message: `Must be less than ${MAX_NAME_LENGTH} characters` }),
});

export type PasskeyNameDto = z.infer<typeof passkeyNameDto>;
