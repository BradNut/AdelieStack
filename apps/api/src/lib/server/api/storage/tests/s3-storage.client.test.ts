import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEndpoint, S3StorageClient } from '../s3-storage.client';

const createClient = () =>
  new S3StorageClient({
    host: 'localhost',
    port: 8333,
    useSSL: false,
    accessKey: 'test-key',
    secretKey: 'test-secret',
  });

const spySend = () => vi.spyOn(S3Client.prototype, 'send');

describe('S3StorageClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildEndpoint', () => {
    it('builds an http endpoint when SSL is off', () => {
      expect(buildEndpoint({ host: 'localhost', port: 8333, useSSL: false })).toBe('http://localhost:8333');
    });

    it('builds an https endpoint when SSL is on', () => {
      expect(buildEndpoint({ host: 'storage.example.com', port: 443, useSSL: true })).toBe('https://storage.example.com:443');
    });
  });

  describe('bucketExists', () => {
    it('returns true when HeadBucket succeeds', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await expect(client.bucketExists('my-bucket')).resolves.toBe(true);
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'my-bucket' });
    });

    it('returns false when the bucket is not found', async () => {
      const client = createClient();
      spySend().mockRejectedValue(new NotFound({ message: 'Not found', $metadata: {} }));

      await expect(client.bucketExists('my-bucket')).resolves.toBe(false);
    });

    it('returns false for a NoSuchBucket error name', async () => {
      const client = createClient();
      const error = Object.assign(new Error('missing'), { name: 'NoSuchBucket' });
      spySend().mockRejectedValue(error);

      await expect(client.bucketExists('my-bucket')).resolves.toBe(false);
    });

    it('re-throws other errors', async () => {
      const client = createClient();
      spySend().mockRejectedValue(new Error('network down'));

      await expect(client.bucketExists('my-bucket')).rejects.toThrow('network down');
    });

    it('re-throws access denied errors instead of reporting a missing bucket', async () => {
      const client = createClient();
      spySend().mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDenied' }));

      await expect(client.bucketExists('my-bucket')).rejects.toThrow('denied');
    });
  });

  describe('createBucket', () => {
    it('sends CreateBucket with the bucket name', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await client.createBucket('my-bucket');

      expect(send.mock.calls[0][0]).toBeInstanceOf(CreateBucketCommand);
      expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'my-bucket' });
    });
  });

  describe('putObject', () => {
    it('sends the body, length, and content type', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);
      const body = Buffer.from('hello');

      await client.putObject('my-bucket', 'key.png', body, 'image/png');

      expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect(send.mock.calls[0][0].input).toEqual({
        Bucket: 'my-bucket',
        Key: 'key.png',
        Body: body,
        ContentLength: 5,
        ContentType: 'image/png',
      });
    });

    it('omits the content type when none is given', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await client.putObject('my-bucket', 'empty', Buffer.alloc(0));

      expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'my-bucket', Key: 'empty', Body: Buffer.alloc(0), ContentLength: 0 });
    });
  });

  describe('getObject', () => {
    it('returns the body as a buffer with its content type', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({
        Body: { transformToByteArray: async () => new TextEncoder().encode('data') },
        ContentType: 'text/plain',
      } as never);

      const result = await client.getObject('my-bucket', 'key.txt');

      expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
      expect(result.body.toString()).toBe('data');
      expect(result.contentType).toBe('text/plain');
    });

    it('throws when the response has no body', async () => {
      const client = createClient();
      spySend().mockResolvedValue({} as never);

      await expect(client.getObject('my-bucket', 'key.txt')).rejects.toThrow('my-bucket/key.txt has no body');
    });

    it('propagates missing-key errors', async () => {
      const client = createClient();
      spySend().mockRejectedValue(new NoSuchKey({ message: 'missing', $metadata: {} }));

      await expect(client.getObject('my-bucket', 'nope')).rejects.toBeInstanceOf(NoSuchKey);
    });
  });

  describe('removeObject', () => {
    it('sends DeleteObject', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await client.removeObject('my-bucket', 'key.txt');

      expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
      expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'my-bucket', Key: 'key.txt' });
    });
  });
});
