import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
  type Tag,
} from '@aws-sdk/client-s3';
import { inject, injectable } from '@needle-di/core';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import type { StorageClientConfig, StoredObject } from './storage.types';

// SeaweedFS ignores the region, but the AWS SDK requires one to sign requests.
const DEFAULT_REGION = 'us-east-1';

const MISSING_BUCKET_ERROR_NAMES = new Set(['NotFound', 'NoSuchBucket']);

const isMissingBucketError = (error: unknown): boolean => error instanceof Error && MISSING_BUCKET_ERROR_NAMES.has(error.name);

export const buildEndpoint = ({ host, port, useSSL }: Pick<StorageClientConfig, 'host' | 'port' | 'useSSL'>): string =>
  `${useSSL ? 'https' : 'http'}://${host}:${port}`;

/**
 * Thin S3-compatible client used against SeaweedFS locally and any S3 provider in production.
 * Constructing it opens no connection; requests are only sent when a method is called.
 */
export class S3StorageClient {
  private readonly s3Client: S3Client;

  static fromEnv(env: Pick<EnvsDto, 'STORAGE_HOST' | 'STORAGE_PORT' | 'STORAGE_SSL' | 'STORAGE_ACCESS_KEY' | 'STORAGE_SECRET_KEY'>): S3StorageClient {
    return new S3StorageClient({
      host: env.STORAGE_HOST,
      port: env.STORAGE_PORT,
      useSSL: env.STORAGE_SSL,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
    });
  }

  constructor(config: StorageClientConfig) {
    this.s3Client = new S3Client({
      endpoint: buildEndpoint(config),
      region: DEFAULT_REGION,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (isMissingBucketError(error)) return false;
      throw error;
    }
  }

  async createBucket(bucket: string): Promise<void> {
    await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.byteLength,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async getObject(bucket: string, key: string): Promise<StoredObject> {
    const result = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) {
      throw new Error(`Object ${bucket}/${key} has no body`);
    }
    return {
      body: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType,
    };
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async setObjectTagging(bucket: string, key: string, tags: Record<string, string>): Promise<void> {
    const tagSet: Tag[] = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
    await this.s3Client.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: { TagSet: tagSet },
      }),
    );
  }
}

/** The one client over the configured storage, created on first use so resolving a service never touches storage. */
@injectable()
export class S3StorageClientProvider {
  private instance: S3StorageClient | undefined;

  constructor(private readonly configService = inject(ConfigService)) {}

  get client(): S3StorageClient {
    this.instance ??= S3StorageClient.fromEnv(this.configService.envs);
    return this.instance;
  }
}
