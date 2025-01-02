import { z } from 'zod';

export const loginRequestDto = z.object({
  email: z.string().email(),
	password: z.string({ required_error: 'Password is required' }),
});

export type LoginRequestDto = z.infer<typeof loginRequestDto>;
