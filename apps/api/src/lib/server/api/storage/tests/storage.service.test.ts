import { Container } from '@needle-di/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { S3StorageClient } from '../s3-storage.client';
import { BucketVisibility } from '../storage.buckets';
import { StorageService } from '../storage.service';

const envs = {
  PROJECT_NAME: 'adelie',
  ENVIRONMENT: 'development',
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_SSL: false,
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
};

const PUBLIC_BUCKET = 'adelie-public-development';
const PRIVATE_BUCKET = 'adelie-private-development';

const createService = () => {
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
  return container.get(StorageService);
};

describe('StorageService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not create a storage client until first use', () => {
    const fromEnv = vi.spyOn(S3StorageClient, 'fromEnv');

    createService();

    expect(fromEnv).not.toHaveBeenCalled();
  });

  it('derives bucket names from PROJECT_NAME and ENVIRONMENT', () => {
    const service = createService();

    expect(service.bucketFor(BucketVisibility.PUBLIC)).toBe(PUBLIC_BUCKET);
    expect(service.bucketFor(BucketVisibility.PRIVATE)).toBe(PRIVATE_BUCKET);
  });

  describe('configure', () => {
    it('creates only the buckets that are missing', async () => {
      vi.spyOn(S3StorageClient.prototype, 'bucketExists').mockImplementation(async (bucket) => bucket === PUBLIC_BUCKET);
      const createBucket = vi.spyOn(S3StorageClient.prototype, 'createBucket').mockResolvedValue();

      await createService().configure();

      expect(createBucket).toHaveBeenCalledTimes(1);
      expect(createBucket).toHaveBeenCalledWith(PRIVATE_BUCKET);
    });

    it('is a no-op when both buckets exist', async () => {
      vi.spyOn(S3StorageClient.prototype, 'bucketExists').mockResolvedValue(true);
      const createBucket = vi.spyOn(S3StorageClient.prototype, 'createBucket').mockResolvedValue();

      await createService().configure();

      expect(createBucket).not.toHaveBeenCalled();
    });

    it('propagates storage failures', async () => {
      vi.spyOn(S3StorageClient.prototype, 'bucketExists').mockRejectedValue(new Error('connection refused'));

      await expect(createService().configure()).rejects.toThrow('connection refused');
    });
  });

  describe('upload', () => {
    it('uploads to the public bucket with the given key and content type by default', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

      const result = await createService().upload({ file, key: 'my-key' });

      expect(result).toEqual({ key: 'my-key' });
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'my-key', Buffer.from('hello'), 'text/plain');
    });

    it('generates a key and targets the private bucket when requested', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const file = new File(['secret'], 'secret.bin');

      const result = await createService().upload({ file, visibility: BucketVisibility.PRIVATE });

      expect(result.key).toEqual(expect.any(String));
      expect(result.key.length).toBeGreaterThan(0);
      expect(putObject).toHaveBeenCalledWith(PRIVATE_BUCKET, result.key, Buffer.from('secret'), undefined);
    });

    it('propagates upload failures', async () => {
      vi.spyOn(S3StorageClient.prototype, 'putObject').mockRejectedValue(new Error('upload failed'));
      const file = new File(['x'], 'x.txt', { type: 'text/plain' });

      await expect(createService().upload({ file })).rejects.toThrow('upload failed');
    });
  });

  describe('get', () => {
    it('reads from the requested bucket', async () => {
      const stored = { body: Buffer.from('data'), contentType: 'text/plain' };
      const getObject = vi.spyOn(S3StorageClient.prototype, 'getObject').mockResolvedValue(stored);

      await expect(createService().get('k', BucketVisibility.PRIVATE)).resolves.toBe(stored);
      expect(getObject).toHaveBeenCalledWith(PRIVATE_BUCKET, 'k');
    });

    it('propagates missing-object errors', async () => {
      vi.spyOn(S3StorageClient.prototype, 'getObject').mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));

      await expect(createService().get('nope')).rejects.toThrow('missing');
    });
  });

  describe('remove', () => {
    it('deletes from the public bucket by default', async () => {
      const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();

      await createService().remove('k');

      expect(removeObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'k');
    });
  });
});
