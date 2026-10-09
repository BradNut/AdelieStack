import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '../common/configs/config.service';
import { DrizzleService } from '../databases/postgres/drizzle.service';
import { type Auth, createAuth, drizzleAuthDatabase } from './auth.config';

/** Owns the single Better Auth instance, created on first use rather than at import time. */
@injectable()
export class AuthService {
  private instance: Auth | null = null;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly drizzleService = inject(DrizzleService),
  ) {}

  get auth(): Auth {
    this.instance ??= createAuth({
      database: drizzleAuthDatabase(this.drizzleService.db),
      secret: this.configService.envs.BETTER_AUTH_SECRET,
      baseURL: this.configService.envs.BETTER_AUTH_URL,
      trustedOrigins: [this.configService.envs.ORIGIN],
    });
    return this.instance;
  }
}
