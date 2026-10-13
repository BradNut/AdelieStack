import { z } from 'zod';

/** Non-secret runtime configuration the API exposes to unauthenticated clients. */
export const publicConfigDto = z.object({
  signUpEnabled: z.boolean(),
});

export type PublicConfigDto = z.infer<typeof publicConfigDto>;
