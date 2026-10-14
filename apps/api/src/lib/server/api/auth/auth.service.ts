import type { CaptchaPublicConfig } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { DrizzleService } from '#lib/server/api/databases/postgres/drizzle.service';
import { MailerService } from '#lib/server/api/mail/mailer.service';
import { type CaptchaConfig, CaptchaStatus, captchaConfigFromEnvs } from './auth.captcha';
import { type Auth, createAuth, drizzleAuthDatabase } from './auth.config';
import { HibpStatus } from './auth.hibp-status';

/** Owns the single Better Auth instance, created on first use rather than at import time. */
@injectable()
export class AuthService {
  private instance: Auth | null = null;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly drizzleService = inject(DrizzleService),
    private readonly mailerService = inject(MailerService),
    private readonly loggerService = inject(LoggerService),
  ) {
    this.hibpStatus = new HibpStatus({ enabled: configService.envs.HIBP_ENABLED, log: this.loggerService.log });
    this.captchaConfig = captchaConfigFromEnvs(configService.envs);
    this.captchaStatus = new CaptchaStatus({ enabled: Boolean(this.captchaConfig), log: this.loggerService.log });
  }

  private readonly captchaConfig: CaptchaConfig | undefined;

  /** Outcome of the most recent Captcha Token verification, for the health surface. */
  readonly captchaStatus: CaptchaStatus;

  /** What the web may know about captcha: never the secret. */
  get captchaPublicConfig(): CaptchaPublicConfig {
    if (!this.captchaConfig) return { enabled: false };
    return { enabled: true, provider: this.captchaConfig.provider, siteKey: this.captchaConfig.siteKey };
  }

  /** Outcome of the most recent breached-password check, for the health surface. */
  readonly hibpStatus: HibpStatus;

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
    });
    return this.instance;
  }
}
