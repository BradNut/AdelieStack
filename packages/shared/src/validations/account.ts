import type { z } from 'zod';
import { validatePasswordPolicy } from './password-policy';

/**
 * Adds an issue for a mismatched confirmation and one issue per violated password rule; `field` is the password field's path.
 * Rule issues carry the rule code as their message so clients can translate them.
 */
export const refinePasswords = (confirm_password: string, password: string, ctx: z.RefinementCtx, field = 'password') => {
  comparePasswords(confirm_password, password, ctx);
  for (const rule of validatePasswordPolicy(password)) {
    ctx.addIssue({ code: 'custom', message: rule, path: [field] });
  }
};

const comparePasswords = (confirm_password: string, password: string, ctx: z.RefinementCtx) => {
  if (confirm_password !== password) {
    ctx.addIssue({
      code: 'custom',
      message: 'Password and Confirm Password must match',
      path: ['confirm_password'],
    });
  }
};
