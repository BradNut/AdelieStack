import { z } from 'zod';

export const changePasswordDto = z.object({
  current_password: z.string({ required_error: 'Current Password is required' }),
  new_password: z.string({ required_error: 'New Password is required' }),
  confirm_password: z.string({ required_error: 'Confirm Password is required' }),
});

export type ChangePasswordDto = z.infer<typeof changePasswordDto>;
