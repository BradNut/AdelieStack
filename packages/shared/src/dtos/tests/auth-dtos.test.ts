import { describe, expect, it } from 'vitest';
import { signinDto } from '../login/signin.dto';
import { recoveryCodeDto, twoFactorCodeDto } from '../login/two-factor-code.dto';
import { resetPasswordNewPasswordDto } from '../reset-password/reset-password-new-password.dto';
import { deleteAccountDto } from '../settings/account/delete-account.dto';
import { changeEmailDto } from '../settings/email/change-email.dto';
import { changePasswordDto } from '../settings/password/change-password.dto';
import { signupDto } from '../signup/signup.dto';

const STRONG = 'Correct-Horse-9';

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((i) => i.path.join('.')) ?? [];
}

describe('signinDto', () => {
  it('accepts an email and password', () => {
    expect(signinDto.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(true);
  });

  it('trims the email', () => {
    expect(signinDto.parse({ email: '  a@example.com ', password: 'x' }).email).toBe('a@example.com');
  });

  it('rejects a bad email and an empty password', () => {
    const result = signinDto.safeParse({ email: 'nope', password: '' });
    expect(issuePaths(result)).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('signupDto', () => {
  const valid = { name: 'Penguin', email: 'p@example.com', password: STRONG, confirm_password: STRONG };

  it('accepts valid input', () => {
    expect(signupDto.safeParse(valid).success).toBe(true);
  });

  it('rejects mismatched confirmation on confirm_password', () => {
    expect(issuePaths(signupDto.safeParse({ ...valid, confirm_password: 'different' }))).toContain('confirm_password');
  });

  it('rejects a weak password on password', () => {
    const weak = 'password';
    expect(issuePaths(signupDto.safeParse({ ...valid, password: weak, confirm_password: weak }))).toContain('password');
  });

  it('rejects an empty name', () => {
    expect(issuePaths(signupDto.safeParse({ ...valid, name: ' ' }))).toContain('name');
  });
});

describe('resetPasswordNewPasswordDto', () => {
  it('accepts a strong matching password', () => {
    expect(resetPasswordNewPasswordDto.safeParse({ password: STRONG, confirm_password: STRONG }).success).toBe(true);
  });

  it('rejects a mismatch', () => {
    expect(resetPasswordNewPasswordDto.safeParse({ password: STRONG, confirm_password: 'x' }).success).toBe(false);
  });
});

describe('changePasswordDto', () => {
  const valid = { current_password: 'old', new_password: STRONG, confirm_password: STRONG };

  it('accepts valid input', () => {
    expect(changePasswordDto.safeParse(valid).success).toBe(true);
  });

  it('flags a weak new password on new_password', () => {
    expect(issuePaths(changePasswordDto.safeParse({ ...valid, new_password: 'weak', confirm_password: 'weak' }))).toContain('new_password');
  });

  it('flags a mismatched confirmation on confirm_password', () => {
    expect(issuePaths(changePasswordDto.safeParse({ ...valid, confirm_password: 'other' }))).toContain('confirm_password');
  });

  it('requires the current password', () => {
    expect(issuePaths(changePasswordDto.safeParse({ ...valid, current_password: '' }))).toContain('current_password');
  });
});

describe('two-factor code dtos', () => {
  it('accepts exactly six digits', () => {
    expect(twoFactorCodeDto.safeParse({ code: '123456' }).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 456'])('rejects %s', (code) => {
    expect(twoFactorCodeDto.safeParse({ code }).success).toBe(false);
  });

  it('accepts a recovery code and rejects a short one', () => {
    expect(recoveryCodeDto.safeParse({ code: 'abcde-fghij' }).success).toBe(true);
    expect(recoveryCodeDto.safeParse({ code: 'abc' }).success).toBe(false);
  });
});

describe('settings dtos', () => {
  it('changeEmailDto trims and accepts a valid address', () => {
    expect(changeEmailDto.parse({ email: '  new@example.com ' }).email).toBe('new@example.com');
  });

  it.each(['', 'not-an-email', `${'a'.repeat(300)}@example.com`])('changeEmailDto rejects %j', (email) => {
    expect(changeEmailDto.safeParse({ email }).success).toBe(false);
  });

  it('deleteAccountDto requires a password', () => {
    expect(deleteAccountDto.safeParse({ password: '' }).success).toBe(false);
    expect(deleteAccountDto.safeParse({ password: 'x' }).success).toBe(true);
  });
});
