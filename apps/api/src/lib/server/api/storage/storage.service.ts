import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import sharp, { type ResizeOptions } from 'sharp';
import { ConfigService } from '../common/configs/config.service';
import { generateId } from '../common/utils/crypto';
import { S3StorageClient } from './s3-storage.client';
import { BucketVisibility, buildBucketName } from './storage.buckets';
import { ScanStatus, ScanTag, type StoredObject, type Upload } from './storage.types';
import { ScanResult, VirusScannerService } from './virus-scanner.service';

@injectable()
export class StorageService {
  private client: S3StorageClient | undefined;

  constructor(
    private readonly configService = inject(ConfigService),
    private readonly virusScanner = inject(VirusScannerService),
  ) {}

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

    // Scan the final bytes before they ever reach storage; infected uploads are rejected.
    await this.scanBeforePersist(buffer);

    const bucket = this.bucketFor(visibility);
    const fileKey = key || generateId();
    await this.getClient().putObject(bucket, fileKey, buffer, file.type || undefined);

    // Record the clean verdict so later webhook/read checks can trust it without re-scanning.
    if (this.virusScanner.isEnabled) {
      await this.getClient().setObjectTagging(bucket, fileKey, {
        [ScanTag.STATUS]: ScanStatus.CLEAN,
        [ScanTag.TIMESTAMP]: new Date().toISOString(),
      });
    }

    return { key: fileKey };
  }

  /**
   * Runs the configured virus scan over the upload bytes. No-op when scanning is
   * disabled; rejects infected files and fails closed when the scanner errors.
   */
  private async scanBeforePersist(buffer: Buffer): Promise<void> {
    if (!this.virusScanner.isEnabled) {
      return;
    }

    const { result, viruses } = await this.virusScanner.scanBuffer(buffer);

    if (result === ScanResult.INFECTED) {
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, {
        message: `File rejected: virus detected${viruses?.length ? ` (${viruses.join(', ')})` : ''}`,
      });
    }

    if (result === ScanResult.ERROR) {
      // Fail closed: if the scanner cannot reach a verdict, do not persist the file.
      throw new HTTPException(StatusCodes.SERVICE_UNAVAILABLE, { message: 'File could not be scanned for viruses. Please try again later.' });
    }
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
