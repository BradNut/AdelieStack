import { z } from 'zod';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '../../../constants/auth-limits';

export const updateProfileDto = z.object({
  name: z
    .string()
    .trim()
    .min(MIN_NAME_LENGTH, { message: 'Name is required' })
    .max(MAX_NAME_LENGTH, { message: `Must be less than ${MAX_NAME_LENGTH} characters` }),
});

export type UpdateProfileDto = z.infer<typeof updateProfileDto>;
