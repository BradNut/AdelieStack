import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { Mailer } from '../mail/interfaces/mailer.interface';
import { EmailChangeNoticeEmail } from '../mail/templates/email-change-notice.template';
import { EmailChangeRequestEmail } from '../mail/templates/email-change-request.template';
import { EmailVerificationEmail } from '../mail/templates/email-verification.template';
import { PasswordChangedEmail } from '../mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '../mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '../mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '../mail/templates/recovery-codes-used.template';
import { CHANGE_EMAIL_REQUEST_TYPE, readVerificationToken } from './auth.verification-token';

/** Auth endpoints whose successful completion triggers a security-event email. */
export const SecurityEventPath = {
  CHANGE_PASSWORD: '/change-password',
  VERIFY_BACKUP_CODE: '/two-factor/verify-backup-code',
  GENERATE_BACKUP_CODES: '/two-factor/generate-backup-codes',
  /** Consumes an emailed verification token; an email-change link also ends up here. */
  VERIFY_EMAIL: '/verify-email',
} as const;

/** What an `hooks.after` handler receives. */
type AfterHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

interface Recipient {
  email: string;
}

/**
 * Connects Better Auth's email callbacks and lifecycle hooks to the {@link Mailer}, so the
 * single `MAILER_TRANSPORT` switch drives every auth email.
 */
export function createAuthMail(mailer: Mailer) {
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
    await mailer.send({ to: claims.email, template: new EmailChangeNoticeEmail(claims.updateTo) });
  }

  return {
    /** Sign-up and resend verification, and (to the new address) the confirmation of an email change. */
    async sendVerificationEmail({ user, url, token }: { user: Recipient; url: string; token?: string }) {
      const isEmailChange = readVerificationToken(token)?.requestType === CHANGE_EMAIL_REQUEST_TYPE;
      const template = isEmailChange ? new EmailChangeRequestEmail(url) : new EmailVerificationEmail(url);
      await mailer.send({ to: user.email, template });
    },

    async sendResetPassword({ user, url }: { user: Recipient; url: string }) {
      await mailer.send({ to: user.email, template: new PasswordResetLinkEmail(url) });
    },

    /** Reset-by-link completion (`emailAndPassword.onPasswordReset`). */
    async notifyPasswordChanged({ user }: { user: Recipient }) {
      await mailer.send({ to: user.email, template: new PasswordChangedEmail() });
    },

    /**
     * `hooks.after` handler for the security events that have no dedicated callback: password
     * change and recovery-code use or regeneration. After hooks also run for failed requests, which are
     * skipped, so one successful call sends exactly one email.
     */
    afterHook: createAuthMiddleware(async (ctx) => {
      if (ctx.path === SecurityEventPath.VERIFY_EMAIL) return notifyOldAddress(ctx);
      if (isAPIError(ctx.context.returned)) return;
      const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
      if (!user) return;
      switch (ctx.path) {
        case SecurityEventPath.CHANGE_PASSWORD:
          await mailer.send({ to: user.email, template: new PasswordChangedEmail() });
          break;
        case SecurityEventPath.VERIFY_BACKUP_CODE:
          await mailer.send({ to: user.email, template: new RecoveryCodesUsedEmail() });
          break;
        case SecurityEventPath.GENERATE_BACKUP_CODES:
          await mailer.send({ to: user.email, template: new RecoveryCodesRegeneratedEmail() });
          break;
      }
    }),
  };
}
