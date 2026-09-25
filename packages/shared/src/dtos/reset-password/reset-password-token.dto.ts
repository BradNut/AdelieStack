import { z } from 'zod';

export const resetPasswordCodeDto = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(6).max(6),
});

export type ResetPasswordCodeDto = z.infer<typeof resetPasswordCodeDto>;
