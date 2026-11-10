import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { getRequestLocale } from '#lib/server/api/common/i18n/index';
import type { EmailTemplate } from '#lib/server/api/mail/interfaces/email-template.interface';
import type { Mailer, MailRecipient } from '#lib/server/api/mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '#lib/server/api/mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '#lib/server/api/mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '#lib/server/api/mail/templates/email-verification.template';
import { PasswordChangedEmail } from '#lib/server/api/mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '#lib/server/api/mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '#lib/server/api/mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '#lib/server/api/mail/templates/recovery-codes-used.template';
import { AuthEndpoint } from './auth.endpoints';
import { CHANGE_EMAIL_REQUEST_TYPE, readVerificationToken, readVerificationTokenOfRequest } from './auth.verification-token';

interface AuthMailUser {
  id: string;
  email: string;
}

export const toMailRecipient = (user: AuthMailUser): MailRecipient => ({ email: user.email, userId: user.id });

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
   * Sends an email and logs a failure instead of throwing it. The entry leaves out the provider's error text, which
   * can quote the address; the mailer's own per-attempt entries carry the detail.
   *
   * Security Events await this. They are told after the change has committed, so a failed send must not answer the
   * request with an error, nor lose what it returns (new recovery codes, a session).
   *
   * Link Emails do not await this, so they leave the request: a response that waited on the send, or reflected how it
   * went, would show an anonymous caller which addresses have accounts during a mail outage.
   */
  async function sendAndLogFailure(to: MailRecipient, template: EmailTemplate, failureLog: string) {
    try {
      await mailer.send({ to, template });
    } catch {
      log?.error({ template: template.constructor.name }, failureLog);
    }
  }

  return {
    /** Sign-up and resend verification, and (to the new address) the confirmation of an email change. */
    async sendVerificationEmail({ user, url, token }: { user: AuthMailUser; url: string; token?: string }) {
      const isEmailChange = readVerificationToken(token)?.requestType === CHANGE_EMAIL_REQUEST_TYPE;
      const locale = getRequestLocale();
      const template = isEmailChange ? new EmailChangeRequestEmail(url, locale) : new EmailVerificationEmail(url, locale);
      void sendAndLogFailure(toMailRecipient(user), template, AUTH_LINK_EMAIL_FAILED_LOG);
    },

    async sendResetPassword({ user, url }: { user: AuthMailUser; url: string }) {
      void sendAndLogFailure(toMailRecipient(user), new PasswordResetLinkEmail(url, getRequestLocale()), AUTH_LINK_EMAIL_FAILED_LOG);
    },

    /**
     * `emailVerification.afterEmailVerification`: tells the old address an email change happened. Better Auth calls this
     * only once it has accepted the link and written the change, which is what makes the old address in the token safe to
     * use: a forged, expired or repeated link never gets here. `hooks.after` cannot tell, because it also runs for
     * rejected links and sees the redirect ending a successful one as an error.
     *
     * `user` is null, whatever Better Auth's type says, for the later of two concurrent clicks: both pass the token check,
     * but its update finds no row left under the old address. The earlier click sends the notice.
     */
    async notifyEmailChanged(user: AuthMailUser | null, request?: Request): Promise<void> {
      const claims = readVerificationTokenOfRequest(request);
      if (!user || claims?.requestType !== CHANGE_EMAIL_REQUEST_TYPE || !claims.email) return;
      await sendAndLogFailure(
        { email: claims.email, userId: user.id },
        new EmailChangeNoticeEmail(user.email, getRequestLocale()),
        SECURITY_EVENT_EMAIL_FAILED_LOG,
      );
    },

    /** Reset-by-link completion (`emailAndPassword.onPasswordReset`). */
    async notifyPasswordChanged({ user }: { user: AuthMailUser }) {
      await sendAndLogFailure(toMailRecipient(user), new PasswordChangedEmail(getRequestLocale()), SECURITY_EVENT_EMAIL_FAILED_LOG);
    },

    /**
     * `hooks.after` handler for the security events that have no dedicated callback: password
     * change and recovery-code use or regeneration. After hooks also run for failed requests, which are
     * skipped, so one successful call sends exactly one email.
     */
    afterHook: createAuthMiddleware(async (ctx) => {
      if (isAPIError(ctx.context.returned)) return;
      const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
      if (!user) return;
      switch (ctx.path) {
        case AuthEndpoint.CHANGE_PASSWORD:
          await sendAndLogFailure(toMailRecipient(user), new PasswordChangedEmail(getRequestLocale()), SECURITY_EVENT_EMAIL_FAILED_LOG);
          break;
        case AuthEndpoint.VERIFY_BACKUP_CODE:
          await sendAndLogFailure(toMailRecipient(user), new RecoveryCodesUsedEmail(getRequestLocale()), SECURITY_EVENT_EMAIL_FAILED_LOG);
          break;
        case AuthEndpoint.GENERATE_BACKUP_CODES:
          await sendAndLogFailure(toMailRecipient(user), new RecoveryCodesRegeneratedEmail(getRequestLocale()), SECURITY_EVENT_EMAIL_FAILED_LOG);
          break;
      }
    }),
  };
}
