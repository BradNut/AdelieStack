import type { z } from 'zod';
import { userDto } from './user.dto';

export const updateUserDto = userDto
  .pick({
    avatar: true,
    first_name: true,
    last_name: true
  })
  .optional();

export type UpdateUserDto = z.infer<typeof updateUserDto>;
