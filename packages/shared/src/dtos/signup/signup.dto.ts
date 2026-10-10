import { z } from 'zod';
import { MAX_EMAIL_LENGTH, MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '../../constants/auth-limits';
import { refinePasswords } from '../../validations/account';

export const signupDto = z
  .object({
    name: z
      .string()
      .trim()
      .min(MIN_NAME_LENGTH, { message: 'Name is required' })
      .max(MAX_NAME_LENGTH, { message: `Must be less than ${MAX_NAME_LENGTH} characters` }),
    email: z
      .string()
      .trim()
      .max(MAX_EMAIL_LENGTH, { message: `Email must be less than ${MAX_EMAIL_LENGTH} characters` })
      .pipe(z.email({ message: 'Please enter a valid email' })),
    password: z.string().min(1, { message: 'Password is required' }),
    confirm_password: z.string().min(1, { message: 'Confirm Password is required' }),
  })
  .superRefine(({ confirm_password, password }, ctx) => {
    refinePasswords(confirm_password, password, ctx);
  });

export type SignupDto = z.infer<typeof signupDto>;
