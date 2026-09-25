import { z } from 'zod/v4';

export const sessionDto = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  fresh: z.boolean(),
});

export type SessionDto = z.infer<typeof sessionDto>;
