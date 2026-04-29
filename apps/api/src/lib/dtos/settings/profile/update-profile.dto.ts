import { z } from 'zod';

const MAX_UPLOAD_SIZE = 1024 * 1024 * 3; // 3MB
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export const updateProfileDto = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, { message: 'Must be at least 1 characters' })
    .max(50, { message: 'Must be less than 50 characters' })
    .optional(),
  last_name: z
    .string()
    .trim()
    .min(1, { message: 'Must be at least 1 characters' })
    .max(50, { message: 'Must be less than 50 characters' })
    .optional(),
  username: z.string().trim().min(3, { message: 'Must be at least 3 characters' }).max(50, { message: 'Must be less than 50 characters' }),
});

export type UpdateProfileDto = z.infer<typeof updateProfileDto>;
