import { z } from 'zod';

export const changePasswordDto = z.object({
  current_password: z.string().min(1, { message: 'Current Password is required' }),
  new_password: z.string().min(1, { message: 'New Password is required' }),
  confirm_password: z.string().min(1, { message: 'Confirm Password is required' }),
});

export type ChangePasswordDto = z.infer<typeof changePasswordDto>;
