import { z } from 'zod/v4';

export const createSessionDto = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

export type CreateSessionDto = z.infer<typeof createSessionDto>;
