import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeSpan } from '../../../../../utils/timespan';
import { TEST_NOW } from '../../testing/factories';
import { createTestContainer, mockProvider } from '../../testing/test-container';
import { HashingService } from '../hashing.service';
import { TokensService } from '../tokens.service';

const TOKEN_PATTERN = /^[23456789ACDEFGHJKLMNPQRSTUVWXYZ]{10}$/;

function createHashingServiceMock() {
  return {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (value: string, hashed: string) => hashed === `hashed:${value}`),
  };
}

describe('TokensService', () => {
  let service: TokensService;
  let hashingService: ReturnType<typeof createHashingServiceMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    hashingService = createHashingServiceMock();
    service = createTestContainer(mockProvider(HashingService, hashingService)).get(TokensService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateToken', () => {
    it('returns a 10 character token from the look-alike-free alphabet', () => {
      expect(service.generateToken()).toMatch(TOKEN_PATTERN);
    });

    it('never emits look-alike characters across many samples', () => {
      const tokens = Array.from({ length: 200 }, () => service.generateToken()).join('');

      expect(tokens).not.toMatch(/[01OI]/);
    });

    it('produces unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => service.generateToken()));

      expect(tokens.size).toBe(100);
    });
  });

  describe('generateTokenWithExpiry', () => {
    it('returns a token that expires after the given lifespan', () => {
      const { token, expiry } = service.generateTokenWithExpiry(15, 'm');

      expect(token).toMatch(TOKEN_PATTERN);
      expect(expiry.getTime()).toBe(TEST_NOW.getTime() + new TimeSpan(15, 'm').milliseconds());
    });

    it('expires immediately for a zero lifespan (boundary)', () => {
      const { expiry } = service.generateTokenWithExpiry(0, 'h');

      expect(expiry.getTime()).toBe(TEST_NOW.getTime());
    });

    it('returns an expiry in the past for a negative lifespan (boundary)', () => {
      const { expiry } = service.generateTokenWithExpiry(-1, 'd');

      expect(expiry.getTime()).toBeLessThan(TEST_NOW.getTime());
    });
  });

  describe('generateTokenWithExpiryAndHash', () => {
    it('returns the token, its hash, and the expiry', async () => {
      const result = await service.generateTokenWithExpiryAndHash(1, 'd');

      expect(result.token).toMatch(TOKEN_PATTERN);
      expect(result.hashedToken).toBe(`hashed:${result.token}`);
      expect(result.expiry.getTime()).toBe(TEST_NOW.getTime() + new TimeSpan(1, 'd').milliseconds());
      expect(hashingService.hash).toHaveBeenCalledExactlyOnceWith(result.token);
    });

    it('propagates hashing failures', async () => {
      hashingService.hash.mockRejectedValueOnce(new Error('hash failed'));

      await expect(service.generateTokenWithExpiryAndHash(1, 'd')).rejects.toThrow('hash failed');
    });
  });

  describe('createHashedToken', () => {
    it('delegates to the hashing service', async () => {
      await expect(service.createHashedToken('abc')).resolves.toBe('hashed:abc');
    });

    it('hashes an empty token (boundary)', async () => {
      await expect(service.createHashedToken('')).resolves.toBe('hashed:');
    });
  });

  describe('verifyHashedToken', () => {
    it('returns true for a matching token', async () => {
      await expect(service.verifyHashedToken('abc', 'hashed:abc')).resolves.toBe(true);
      expect(hashingService.compare).toHaveBeenCalledWith('abc', 'hashed:abc');
    });

    it('returns false for a mismatched token', async () => {
      await expect(service.verifyHashedToken('abc', 'hashed:xyz')).resolves.toBe(false);
    });

    it('propagates comparison failures for malformed hashes', async () => {
      hashingService.compare.mockRejectedValueOnce(new Error('malformed hash'));

      await expect(service.verifyHashedToken('abc', 'garbage')).rejects.toThrow('malformed hash');
    });
  });
});
