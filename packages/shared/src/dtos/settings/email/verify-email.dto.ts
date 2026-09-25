import { z } from 'zod';
import { VERIFICATION_CODE_LENGTH } from '../../../constants/auth-limits';

export const verifyEmailDto = z.object({
  code: z.string().length(VERIFICATION_CODE_LENGTH),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailDto>;
