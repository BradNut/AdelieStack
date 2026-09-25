import { z } from 'zod';
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from '../../constants/auth-limits';

export const signinDto = z.object({
  identifier: z
    .string()
    .trim()
    .min(MIN_USERNAME_LENGTH, { message: `Must be at least ${MIN_USERNAME_LENGTH} characters` })
    .max(MAX_USERNAME_LENGTH, { message: `Must be less than ${MAX_USERNAME_LENGTH} characters` }),
  password: z.string().trim().min(1, { message: 'Password is required' }),
});

export type SignInDto = z.infer<typeof signinDto>;
