import { z } from 'zod';
import { SOCIAL_PROVIDERS } from '../../constants/social-providers';

/** Non-secret runtime configuration the API exposes to unauthenticated clients. */
export const publicConfigDto = z.object({
  signUpEnabled: z.boolean(),
  /** Social providers with credentials configured; empty on a fresh install. */
  socialProviders: z.array(z.enum(SOCIAL_PROVIDERS)),
});

export type PublicConfigDto = z.infer<typeof publicConfigDto>;
