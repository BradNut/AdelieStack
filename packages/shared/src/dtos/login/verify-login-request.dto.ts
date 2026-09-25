import { z } from 'zod';
import { VERIFICATION_CODE_LENGTH } from '../../constants/auth-limits';

export const verifyLoginRequestDto = z.object({
  email: z.string().email(),
  code: z.string().length(VERIFICATION_CODE_LENGTH),
});

export type VerifyLoginRequestDto = z.infer<typeof verifyLoginRequestDto>;
