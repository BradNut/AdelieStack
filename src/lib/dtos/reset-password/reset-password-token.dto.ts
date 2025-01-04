import { z } from 'zod';

export const resetPasswordTokenDto = z.object({
  token: z.string().trim().min(6).max(6),
});
