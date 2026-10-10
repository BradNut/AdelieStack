import { Container } from '@needle-di/core';
import type { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '../../common/configs/config.service';
import { S3StorageClient } from '../s3-storage.client';
import { BucketVisibility } from '../storage.buckets';
import { StorageService } from '../storage.service';
import { ScanStatus, ScanTag } from '../storage.types';
import { type ScanResponse, ScanResult, VirusScannerService } from '../virus-scanner.service';

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

/** Builds a StorageService with a stubbed virus scanner so upload behavior can be driven directly. */
const createServiceWithScanner = (scanner: Partial<VirusScannerService>) => {
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: { envs } as unknown as ConfigService });
  container.bind({ provide: VirusScannerService, useValue: scanner as VirusScannerService });
  return container.get(StorageService);
};

const scanStub = (enabled: boolean, scanBuffer: () => Promise<ScanResponse>): Partial<VirusScannerService> => ({
  get isEnabled() {
    return enabled;
  },
  scanBuffer: vi.fn(scanBuffer),
});

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

  describe('upload virus scanning', () => {
    it('stores a clean file and tags it as scanned clean when antivirus is enabled', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(true, async () => ({ result: ScanResult.CLEAN }));
      const file = new File(['hello'], 'hello.png', { type: 'image/png' });

      const result = await createServiceWithScanner(scanner).upload({ file, key: 'clean-key' });

      expect(result).toEqual({ key: 'clean-key' });
      expect(scanner.scanBuffer).toHaveBeenCalledWith(Buffer.from('hello'));
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'clean-key', Buffer.from('hello'), 'image/png');
      expect(setObjectTagging).toHaveBeenCalledWith(PUBLIC_BUCKET, 'clean-key', expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.CLEAN }));
    });

    it('rejects an infected file and never persists it', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(true, async () => ({ result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] }));
      const file = new File(['virus'], 'bad.png', { type: 'image/png' });

      const error = (await createServiceWithScanner(scanner)
        .upload({ file })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(422);
      expect(error.message).toContain('Eicar-Test-Signature');
      expect(putObject).not.toHaveBeenCalled();
    });

    it('fails closed and does not persist when the scanner errors', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(true, async () => ({ result: ScanResult.ERROR, error: 'daemon unreachable' }));
      const file = new File(['x'], 'x.png', { type: 'image/png' });

      const error = (await createServiceWithScanner(scanner)
        .upload({ file })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(503);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('skips scanning entirely when antivirus is disabled', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(false, async () => ({ result: ScanResult.INFECTED }));
      const file = new File(['hello'], 'hello.png', { type: 'image/png' });

      const result = await createServiceWithScanner(scanner).upload({ file, key: 'skip-key' });

      expect(result).toEqual({ key: 'skip-key' });
      expect(scanner.scanBuffer).not.toHaveBeenCalled();
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'skip-key', Buffer.from('hello'), 'image/png');
      expect(setObjectTagging).not.toHaveBeenCalled();
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
