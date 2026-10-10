import { z } from 'zod';

export const deleteAccountDto = z.object({
  password: z.string().min(1, { message: 'Password is required' }),
});

export type DeleteAccountDto = z.infer<typeof deleteAccountDto>;
