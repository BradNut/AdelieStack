import { z } from 'zod';

export const resetPasswordEmailDto = z.object({
  email: z.string().trim().email().max(64, { message: 'Email must be less than 64 characters' }),
});

export type ResetPasswordRequestDto = z.infer<typeof resetPasswordEmailDto>;
