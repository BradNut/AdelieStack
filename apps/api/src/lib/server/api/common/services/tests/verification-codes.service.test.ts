import { VERIFICATION_CODE_LENGTH } from '@adelie/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContainer, mockProvider } from '../../testing/test-container';
import { HashingService } from '../hashing.service';
import { VerificationCodesService } from '../verification-codes.service';

const CODE_PATTERN = new RegExp(`^[23456789ACDEFGHJKLMNPQRSTUVWXYZ]{${VERIFICATION_CODE_LENGTH}}$`);

describe('VerificationCodesService', () => {
  let service: VerificationCodesService;
  const hashingService = {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (value: string, hashed: string) => hashed === `hashed:${value}`),
  };

  beforeEach(() => {
    service = createTestContainer(mockProvider(HashingService, hashingService)).get(VerificationCodesService);
  });

  describe('generateCodeWithHash', () => {
    it('returns a code matching the shared verification code length and its hash', async () => {
      const { verificationCode, hashedVerificationCode } = await service.generateCodeWithHash();

      expect(verificationCode).toMatch(CODE_PATTERN);
      expect(hashedVerificationCode).toBe(`hashed:${verificationCode}`);
    });

    it('never emits look-alike characters', async () => {
      const codes = await Promise.all(Array.from({ length: 100 }, () => service.generateCodeWithHash()));

      expect(codes.map((c) => c.verificationCode).join('')).not.toMatch(/[01OI]/);
    });

    it('propagates hashing failures', async () => {
      hashingService.hash.mockRejectedValueOnce(new Error('hash failed'));

      await expect(service.generateCodeWithHash()).rejects.toThrow('hash failed');
    });
  });

  describe('verify', () => {
    it('returns true for the matching code', async () => {
      await expect(service.verify({ verificationCode: 'ABC234', hashedVerificationCode: 'hashed:ABC234' })).resolves.toBe(true);
    });

    it('returns false for a wrong code', async () => {
      await expect(service.verify({ verificationCode: 'ABC234', hashedVerificationCode: 'hashed:ZZZ999' })).resolves.toBe(false);
    });

    it('returns false for an empty code (boundary)', async () => {
      await expect(service.verify({ verificationCode: '', hashedVerificationCode: 'hashed:ABC234' })).resolves.toBe(false);
    });

    it('propagates comparison failures', async () => {
      hashingService.compare.mockRejectedValueOnce(new Error('malformed hash'));

      await expect(service.verify({ verificationCode: 'ABC234', hashedVerificationCode: '' })).rejects.toThrow('malformed hash');
    });
  });
});
