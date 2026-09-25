import { MAX_PASSWORD_LENGTH } from '@adelie/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContainer } from '../../testing/test-container';
import { HashingService } from '../hashing.service';

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(() => {
    service = createTestContainer().get(HashingService);
  });

  describe('hash', () => {
    it('returns an argon2id hash that differs from the input', async () => {
      const hashed = await service.hash('password');

      expect(hashed).not.toBe('password');
      expect(hashed.startsWith('$argon2id$')).toBe(true);
    });

    it('salts each hash so identical inputs produce different hashes', async () => {
      const [first, second] = await Promise.all([service.hash('password'), service.hash('password')]);

      expect(first).not.toBe(second);
    });

    it('hashes an empty string (boundary)', async () => {
      const hashed = await service.hash('');

      await expect(service.compare('', hashed)).resolves.toBe(true);
    });

    it('hashes a maximum-length unicode value (boundary)', async () => {
      const value = 'π'.repeat(MAX_PASSWORD_LENGTH);
      const hashed = await service.hash(value);

      await expect(service.compare(value, hashed)).resolves.toBe(true);
    });
  });

  describe('compare', () => {
    it('returns true for the matching value', async () => {
      const hashed = await service.hash('password');

      await expect(service.compare('password', hashed)).resolves.toBe(true);
    });

    it('returns false for a different value', async () => {
      const hashed = await service.hash('notPassword');

      await expect(service.compare('password', hashed)).resolves.toBe(false);
    });

    it('is case sensitive', async () => {
      const hashed = await service.hash('Password');

      await expect(service.compare('password', hashed)).resolves.toBe(false);
    });

    it('rejects when the stored value is not a valid hash', async () => {
      await expect(service.compare('password', 'not-a-hash')).rejects.toThrow();
    });

    it('rejects when the stored hash is empty', async () => {
      await expect(service.compare('password', '')).rejects.toThrow();
    });
  });
});
