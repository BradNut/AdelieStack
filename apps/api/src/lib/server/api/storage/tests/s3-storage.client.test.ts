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
import type { ConfigService } from '#lib/server/api/common/configs/config.service';
import { buildEndpoint, S3Presigner, S3StorageClient, S3StorageClientProvider } from '#lib/server/api/storage/s3-storage.client';

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

    it('sends the tags URL-encoded in the same request', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await client.putObject('my-bucket', 'key.png', Buffer.from('hello'), 'image/png', {
        'scan-status': 'clean',
        'scan-timestamp': '20261121T070809Z',
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toMatchObject({ Tagging: 'scan-status=clean&scan-timestamp=20261121T070809Z' });
    });

    it('sends no tagging when no tags are given', async () => {
      const client = createClient();
      const send = spySend().mockResolvedValue({} as never);

      await client.putObject('my-bucket', 'key.png', Buffer.from('hello'), 'image/png');

      expect(send.mock.calls[0][0].input).not.toHaveProperty('Tagging');
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

  describe('getObjectStream', () => {
    const webStream = () => new ReadableStream<Uint8Array>();

    it('returns the body as a stream with its content type and length', async () => {
      const client = createClient();
      const stream = webStream();
      const send = spySend().mockResolvedValue({
        Body: { transformToWebStream: () => stream },
        ContentType: 'image/png',
        ContentLength: 42,
      } as never);

      const result = await client.getObjectStream('my-bucket', 'key.png');

      expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
      expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'my-bucket', Key: 'key.png' });
      expect(result).toEqual({ stream, contentType: 'image/png', contentLength: 42 });
    });

    it('leaves out a type and length the response does not give', async () => {
      const client = createClient();
      spySend().mockResolvedValue({ Body: { transformToWebStream: webStream } } as never);

      const result = await client.getObjectStream('my-bucket', 'key.png');

      expect(result.contentType).toBeUndefined();
      expect(result.contentLength).toBeUndefined();
    });

    it('throws when the response has no body', async () => {
      const client = createClient();
      spySend().mockResolvedValue({} as never);

      await expect(client.getObjectStream('my-bucket', 'key.txt')).rejects.toThrow('my-bucket/key.txt has no body');
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

describe('S3Presigner', () => {
  const presigner = () => new S3Presigner({ endpoint: 'https://files.example.com', accessKey: 'test-key', secretKey: 'test-secret' });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs a GET of the object against its own endpoint, offline', async () => {
    const send = spySend();

    const url = new URL(await presigner().presignedGetObject('my-bucket', 'images/photo.png', 600));

    expect(url.origin).toBe('https://files.example.com');
    expect(url.pathname).toBe('/my-bucket/images/photo.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^test-key\//);
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(send).not.toHaveBeenCalled();
  });

  it('is built from STORAGE_URL, the address browsers reach storage on', async () => {
    const fromEnv = S3Presigner.fromEnv({ STORAGE_URL: 'http://localhost:8333', STORAGE_ACCESS_KEY: 'key', STORAGE_SECRET_KEY: 'secret' });

    const url = new URL(await fromEnv.presignedGetObject('my-bucket', 'k', 1));

    expect(url.origin).toBe('http://localhost:8333');
  });
});

describe('S3StorageClientProvider', () => {
  const envs = {
    STORAGE_HOST: 'seaweedfs',
    STORAGE_PORT: 8333,
    STORAGE_SSL: false,
    STORAGE_ACCESS_KEY: 'key',
    STORAGE_SECRET_KEY: 'secret',
    STORAGE_URL: 'https://files.example.com',
  };
  const provider = () => new S3StorageClientProvider({ envs } as unknown as ConfigService);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the presigner on first use only, once', () => {
    const fromEnv = vi.spyOn(S3Presigner, 'fromEnv');
    const subject = provider();

    expect(fromEnv).not.toHaveBeenCalled();
    expect(subject.presigner).toBe(subject.presigner);
    expect(fromEnv).toHaveBeenCalledOnce();
  });

  it('signs against STORAGE_URL, not the internal STORAGE_HOST and STORAGE_PORT', async () => {
    const url = new URL(await provider().presigner.presignedGetObject('my-bucket', 'k', 1));

    expect(url.origin).toBe('https://files.example.com');
  });
});
