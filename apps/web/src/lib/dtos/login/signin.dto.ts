import { z } from 'zod';

export const signinDto = z.object({
  identifier: z.string().trim().min(3, { message: 'Must be at least 3 characters' }).max(50, { message: 'Must be less than 50 characters' }),
  password: z.string({ required_error: 'Password is required' }).trim(),
});

export type SignInDto = z.infer<typeof signinDto>;
