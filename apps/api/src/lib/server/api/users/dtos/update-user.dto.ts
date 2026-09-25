import type { z } from 'zod/v4';
import { userDto } from './user.dto';

export const updateUserDto = userDto
  .pick({
    avatar: true,
    first_name: true,
    last_name: true,
    username: true,
  })
  .optional();

export type UpdateUserDto = z.infer<typeof updateUserDto>;
