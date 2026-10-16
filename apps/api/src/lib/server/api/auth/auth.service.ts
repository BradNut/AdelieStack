import { type CaptchaPublicConfig, isProdEnv, type SocialProvider } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { SHARED_RATE_LIMIT_BUCKET_WARNING, sharesOneRateLimitBucket } from '#lib/server/api/common/configs/dtos/env.dto';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';
import { MailerService } from '#lib/server/api/mail/mailer.service';
import { type CaptchaConfig, captchaConfigFromEnvs, createCaptchaHealth } from './auth.captcha';
import { type Auth, createAuth, drizzleAuthDatabase } from './auth.config';
import { createHibpHealth } from './auth.hibp-status';
import type { ProviderHealth } from './auth.provider-health';
import { AuthRateLimitRepository } from './auth.rate-limit.repository';
import { enabledSocialProviders, type SocialCredentialsByProvider, socialCredentialsFromEnvs } from './auth.social';

/** Owns the single Better Auth instance, created on first use rather than at import time. */
@injectable()
export class AuthService {
  private instance: Auth | null = null;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly drizzleService = inject(DrizzleService),
    private readonly mailerService = inject(MailerService),
    private readonly loggerService = inject(LoggerService),
    private readonly rateLimitRepository = inject(AuthRateLimitRepository),
  ) {
    this.hibpStatus = createHibpHealth({ enabled: configService.envs.HIBP_ENABLED, log: this.loggerService.log });
    this.captchaConfig = captchaConfigFromEnvs(configService.envs);
    this.socialCredentials = socialCredentialsFromEnvs(configService.envs);
    this.captchaStatus = createCaptchaHealth({ enabled: Boolean(this.captchaConfig), log: this.loggerService.log });
    // Production refuses to start in this state (env.dto.ts); elsewhere it is allowed but worth a loud note.
    if (!isProdEnv(configService.envs.ENV) && sharesOneRateLimitBucket(configService.envs)) {
      this.loggerService.log.warn(SHARED_RATE_LIMIT_BUCKET_WARNING);
    }
  }

  private readonly captchaConfig: CaptchaConfig | undefined;

  private readonly socialCredentials: SocialCredentialsByProvider;

  /** Providers whose credentials are configured: the one answer for the public config and for what Better Auth registers. */
  get enabledSocialProviders(): SocialProvider[] {
    return enabledSocialProviders(this.socialCredentials);
  }

  /** Outcome of the most recent Captcha Token verification, for the health surface. */
  readonly captchaStatus: ProviderHealth;

  /** What the web may know about captcha: never the secret. */
  get captchaPublicConfig(): CaptchaPublicConfig {
    if (!this.captchaConfig) return { enabled: false };
    return { enabled: true, provider: this.captchaConfig.provider, siteKey: this.captchaConfig.siteKey };
  }

  /** Outcome of the most recent breached-password check, for the health surface. */
  readonly hibpStatus: ProviderHealth;

  get auth(): Auth {
    this.instance ??= createAuth({
      database: drizzleAuthDatabase(this.drizzleService.db),
      secret: this.configService.envs.BETTER_AUTH_SECRET,
      baseURL: this.configService.envs.BETTER_AUTH_URL,
      trustedOrigins: [this.configService.envs.ORIGIN],
      twoFactorIssuer: this.configService.envs.TWO_FACTOR_ISSUER,
      passkey: {
        rpID: this.configService.envs.PASSKEY_RP_ID,
        rpName: this.configService.envs.PASSKEY_RP_NAME,
        origin: this.configService.envs.ORIGIN,
      },
      mailer: this.mailerService,
      signUpEnabled: this.configService.envs.SIGN_UP_ENABLED,
      allowMultipleRoles: () => this.configService.envs.ALLOW_MULTIPLE_ROLES,
      hibpEnabled: this.configService.envs.HIBP_ENABLED,
      hibpStatus: this.hibpStatus,
      captcha: this.captchaConfig,
      captchaStatus: this.captchaStatus,
      trustProxy: this.configService.envs.TRUST_PROXY,
      socialProviders: this.socialCredentials,
      // The Redis connection opens on the first limited request, not here.
      rateLimitStorage: this.configService.envs.DISABLE_RATE_LIMIT ? undefined : this.rateLimitRepository,
      // Dev-only, like logging and pretty output: everything but prod. (The app's own /api/reference is always on.)
      openApiReference: !isProdEnv(this.configService.envs.ENV),
    });
    return this.instance;
  }
}
