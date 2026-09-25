import { z } from 'zod';

export const loginRequestDto = z.object({
  username: z.string().email(),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginRequestDto = z.infer<typeof loginRequestDto>;
