import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { Mailer } from '../mail/interfaces/mailer.interface';
import { EmailVerificationEmail } from '../mail/templates/email-verification.template';
import { PasswordChangedEmail } from '../mail/templates/password-changed.template';
import { PasswordResetLinkEmail } from '../mail/templates/password-reset-link.template';
import { RecoveryCodesRegeneratedEmail } from '../mail/templates/recovery-codes-regenerated.template';
import { RecoveryCodesUsedEmail } from '../mail/templates/recovery-codes-used.template';

/** Auth endpoints whose successful completion triggers a security-event email. */
export const SecurityEventPath = {
  CHANGE_PASSWORD: '/change-password',
  VERIFY_BACKUP_CODE: '/two-factor/verify-backup-code',
  GENERATE_BACKUP_CODES: '/two-factor/generate-backup-codes',
} as const;

interface Recipient {
  email: string;
}

/**
 * Connects Better Auth's email callbacks and lifecycle hooks to the {@link Mailer}, so the
 * single `MAILER_TRANSPORT` switch drives every auth email.
 */
export function createAuthMail(mailer: Mailer) {
  return {
    async sendVerificationEmail({ user, url }: { user: Recipient; url: string }) {
      await mailer.send({ to: user.email, template: new EmailVerificationEmail(url) });
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
