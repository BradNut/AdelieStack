import { z } from 'zod';
import { MAX_EMAIL_LENGTH } from '../../constants/auth-limits';
import { PASSWORD_REQUIRED_MESSAGE } from '../../constants/validation-messages';

export const signinDto = z.object({
  email: z
    .string()
    .trim()
    .max(MAX_EMAIL_LENGTH, { message: `Email must be less than ${MAX_EMAIL_LENGTH} characters` })
    .pipe(z.email({ message: 'Please enter a valid email' })),
  password: z.string().min(1, { message: PASSWORD_REQUIRED_MESSAGE }),
});

export type SignInDto = z.infer<typeof signinDto>;
