import { z } from 'zod';
import { refinePasswords } from '../../validations/account';

export const resetPasswordNewPasswordDto = z
  .object({
    password: z.string().min(1, { message: 'Password is required' }),
    confirm_password: z.string().min(1, { message: 'Confirm Password is required' }),
  })
  .superRefine(({ confirm_password, password }, ctx) => {
    refinePasswords(confirm_password, password, ctx);
  });

export type ResetPasswordNewPasswordDto = z.infer<typeof resetPasswordNewPasswordDto>;
