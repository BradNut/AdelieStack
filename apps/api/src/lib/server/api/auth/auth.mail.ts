import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { getRequestLocale } from '#lib/server/api/common/i18n/index';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import type { Mailer } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { AuthEndpoint } from './auth.endpoints';
import { CHANGE_EMAIL_REQUEST_TYPE, readVerificationToken } from './auth.verification-token';

/** What an `hooks.after` handler receives. */
type AfterHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

interface Recipient {
  email: string;
}

/** Stable, greppable log message for a Security Event email that could not be sent. */
export const SECURITY_EVENT_EMAIL_FAILED_LOG = 'SECURITY_EVENT_EMAIL_FAILED';

/** Stable, greppable log message for a Link Email that was given up on. */
export const AUTH_LINK_EMAIL_FAILED_LOG = 'AUTH_LINK_EMAIL_FAILED';

/** The slice of the logger that failures are written to. */
export interface AuthMailLogger {
  error(obj: Record<string, unknown>, message: string): void;
}

/**
 * Connects Better Auth's email callbacks and lifecycle hooks to the {@link Mailer}, so the
 * single `MAILER_TRANSPORT` switch drives every auth email.
 */
export function createAuthMail(mailer: Mailer, log?: AuthMailLogger) {
  /**
   * Security Events are told after the change has committed, so a failed send must not answer the request with an
   * error, nor lose what it returns (new recovery codes, a session). The entry leaves out the provider's error text,
   * which can quote the address; the mailer's own per-attempt entries carry the detail.
   */
  async function sendSecurityEvent(to: string, template: EmailTemplate) {
    try {
      await mailer.send({ to, template });
    } catch {
      log?.error({ template: template.constructor.name }, SECURITY_EVENT_EMAIL_FAILED_LOG);
    }
  }

  /**
   * Link Emails leave the request: a response that waited on the send, or reflected how it went, would show an
   * anonymous caller which addresses have accounts during a mail outage. Nothing awaits this, so every failure ends
   * here, and as with a Security Event the entry leaves out the provider's error text.
   */
  async function detachLinkEmail(to: string, template: EmailTemplate) {
    try {
      await mailer.send({ to, template });
    } catch {
      log?.error({ template: template.constructor.name }, AUTH_LINK_EMAIL_FAILED_LOG);
    }
  }

  /**
   * After a followed email-change link: tells the old address the change happened. The token is
   * only trusted once the old address is gone and the new one exists, so a failed, forged or
   * repeated link sends nothing.
   */
  async function notifyOldAddress(ctx: AfterHookContext) {
    const claims = readVerificationToken(ctx.query?.token);
    if (claims?.requestType !== CHANGE_EMAIL_REQUEST_TYPE || !claims.email || !claims.updateTo) return;
    const { internalAdapter } = ctx.context;
    const [oldAccount, newAccount] = await Promise.all([
      internalAdapter.findUserByEmail(claims.email),
      internalAdapter.findUserByEmail(claims.updateTo),
    ]);
    if (oldAccount || !newAccount) return;
    await sendSecurityEvent(claims.email, new EmailChangeNoticeEmail(claims.updateTo, getRequestLocale()));
  }

  return {
    /** Sign-up and resend verification, and (to the new address) the confirmation of an email change. */
    async sendVerificationEmail({ user, url, token }: { user: Recipient; url: string; token?: string }) {
      const isEmailChange = readVerificationToken(token)?.requestType === CHANGE_EMAIL_REQUEST_TYPE;
      const locale = getRequestLocale();
      const template = isEmailChange ? new EmailChangeRequestEmail(url, locale) : new EmailVerificationEmail(url, locale);
      void detachLinkEmail(user.email, template);
    },

    async sendResetPassword({ user, url }: { user: Recipient; url: string }) {
      void detachLinkEmail(user.email, new PasswordResetLinkEmail(url, getRequestLocale()));
    },

    /** Reset-by-link completion (`emailAndPassword.onPasswordReset`). */
    async notifyPasswordChanged({ user }: { user: Recipient }) {
      await sendSecurityEvent(user.email, new PasswordChangedEmail(getRequestLocale()));
    },

    /**
     * `hooks.after` handler for the security events that have no dedicated callback: password
     * change and recovery-code use or regeneration. After hooks also run for failed requests, which are
     * skipped, so one successful call sends exactly one email.
     */
    afterHook: createAuthMiddleware(async (ctx) => {
      // Consumes an emailed verification token; an email-change link also ends up here.
      if (ctx.path === AuthEndpoint.VERIFY_EMAIL) return notifyOldAddress(ctx);
      if (isAPIError(ctx.context.returned)) return;
      const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
      if (!user) return;
      switch (ctx.path) {
        case AuthEndpoint.CHANGE_PASSWORD:
          await sendSecurityEvent(user.email, new PasswordChangedEmail(getRequestLocale()));
          break;
        case AuthEndpoint.VERIFY_BACKUP_CODE:
          await sendSecurityEvent(user.email, new RecoveryCodesUsedEmail(getRequestLocale()));
          break;
        case AuthEndpoint.GENERATE_BACKUP_CODES:
          await sendSecurityEvent(user.email, new RecoveryCodesRegeneratedEmail(getRequestLocale()));
          break;
      }
    }),
  };
}
