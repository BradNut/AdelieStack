import { z } from 'zod';
import { MAX_NAME_LENGTH, MAX_USERNAME_LENGTH, MIN_NAME_LENGTH, MIN_USERNAME_LENGTH } from '../../../constants/auth-limits';

export const updateProfileDto = z.object({
  first_name: z
    .string()
    .trim()
    .min(MIN_NAME_LENGTH, { message: `Must be at least ${MIN_NAME_LENGTH} characters` })
    .max(MAX_NAME_LENGTH, { message: `Must be less than ${MAX_NAME_LENGTH} characters` })
    .optional(),
  last_name: z
    .string()
    .trim()
    .min(MIN_NAME_LENGTH, { message: `Must be at least ${MIN_NAME_LENGTH} characters` })
    .max(MAX_NAME_LENGTH, { message: `Must be less than ${MAX_NAME_LENGTH} characters` })
    .optional(),
  username: z
    .string()
    .trim()
    .min(MIN_USERNAME_LENGTH, { message: `Must be at least ${MIN_USERNAME_LENGTH} characters` })
    .max(MAX_USERNAME_LENGTH, { message: `Must be less than ${MAX_USERNAME_LENGTH} characters` }),
});

export type UpdateProfileDto = z.infer<typeof updateProfileDto>;
