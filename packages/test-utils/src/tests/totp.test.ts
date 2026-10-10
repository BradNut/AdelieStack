import { afterEach, describe, expect, it, vi } from 'vitest';
import { totpCode } from '../totp';

// RFC 6238 appendix B secret "12345678901234567890", base32-encoded.
const uri = 'otpauth://totp/Adelie:test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Adelie';

describe('totpCode', () => {
  afterEach(() => vi.useRealTimers());

  it('matches the RFC 6238 SHA-1 vector for T=59s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);
    expect(totpCode(uri)).toBe('287082');
  });

  it('shifts by whole 30 second steps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);
    expect(totpCode(uri, 1)).toBe('359152');
  });
});
