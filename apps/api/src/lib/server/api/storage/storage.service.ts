import { inject, injectable } from '@needle-di/core';
import sharp, { type ResizeOptions } from 'sharp';
import { ConfigService } from '../common/configs/config.service';
import { generateId } from '../common/utils/crypto';
import { S3StorageClient } from './s3-storage.client';
import { BucketVisibility, buildBucketName } from './storage.buckets';
import type { StoredObject, Upload } from './storage.types';

@injectable()
export class StorageService {
  private client: S3StorageClient | undefined;

  constructor(private readonly configService = inject(ConfigService)) {}

  /** Idempotently ensures the public and private buckets exist. */
  async configure() {
    console.info('configuring storage...');
    const client = this.getClient();

    for (const visibility of Object.values(BucketVisibility)) {
      const bucket = this.bucketFor(visibility);
      if (!(await client.bucketExists(bucket))) {
        console.info(`creating storage bucket ${bucket}...`);
        await client.createBucket(bucket);
      }
    }
  }

  async upload({ file, resizeOptions, key, visibility = BucketVisibility.PUBLIC }: Upload) {
    let buffer: Buffer = await this.convertToBuffer(file);
    if (resizeOptions) {
      buffer = await this.resizeImage(buffer, resizeOptions);
    }

    const fileKey = key || generateId();
    await this.getClient().putObject(this.bucketFor(visibility), fileKey, buffer, file.type || undefined);
    return { key: fileKey };
  }

  async get(key: string, visibility: BucketVisibility = BucketVisibility.PUBLIC): Promise<StoredObject> {
    return this.getClient().getObject(this.bucketFor(visibility), key);
  }

  async remove(key: string, visibility: BucketVisibility = BucketVisibility.PUBLIC) {
    return this.getClient().removeObject(this.bucketFor(visibility), key);
  }

  bucketFor(visibility: BucketVisibility): string {
    const { PROJECT_NAME, ENVIRONMENT } = this.configService.envs;
    return buildBucketName(PROJECT_NAME, ENVIRONMENT, visibility);
  }

  // Created on first use so constructing the service never touches storage.
  private getClient(): S3StorageClient {
    this.client ??= S3StorageClient.fromEnv(this.configService.envs);
    return this.client;
  }

  private async resizeImage(fileBuffer: Buffer, resizeOptions: ResizeOptions) {
    return sharp(fileBuffer).resize(resizeOptions).toBuffer();
  }

  private async convertToBuffer(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
