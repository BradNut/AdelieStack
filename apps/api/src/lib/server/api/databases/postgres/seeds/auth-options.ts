import type { CreateAuthOptions } from '#lib/server/api/auth/auth.config';
import { createHibpHealth } from '#lib/server/api/auth/auth.hibp-status';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';

/** The environment-driven auth options for the seed. Seeded users are screened only while `HIBP_ENABLED` is on, as at runtime. */
export const seedAuthOptions = (envs: Pick<EnvsDto, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'HIBP_ENABLED'>) =>
  ({
    secret: envs.BETTER_AUTH_SECRET,
    baseURL: envs.BETTER_AUTH_URL,
    hibpStatus: createHibpHealth({ enabled: envs.HIBP_ENABLED }),
  }) satisfies Partial<CreateAuthOptions>;
