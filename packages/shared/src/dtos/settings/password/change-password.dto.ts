import { z } from 'zod';
import { refinePasswords } from '../../../validations/account';

export const changePasswordDto = z
  .object({
    current_password: z.string().min(1, { message: 'Current Password is required' }),
    new_password: z.string().min(1, { message: 'New Password is required' }),
    confirm_password: z.string().min(1, { message: 'Confirm Password is required' }),
  })
  .superRefine(({ confirm_password, new_password }, ctx) => {
    refinePasswords(confirm_password, new_password, ctx, 'new_password');
  });

export type ChangePasswordDto = z.infer<typeof changePasswordDto>;
