import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { publicId } from '#lib/server/api/common/utils/crypto';
import { ImagesService } from './images.service';
import { S3StorageClientProvider } from './s3-storage.client';
import { BucketVisibility, buildBucketName } from './storage.buckets';
import { ScanStatus, type StoredObject, scanTags, type Upload } from './storage.types';
import { ScanResult, VirusScannerService } from './virus-scanner.service';

@injectable()
export class StorageService {
  constructor(
    private readonly configService = inject(ConfigService),
    private readonly virusScanner = inject(VirusScannerService),
    private readonly storage = inject(S3StorageClientProvider),
    private readonly images = inject(ImagesService),
  ) {}

  /** Idempotently ensures the public and private buckets exist. */
  async configure() {
    console.info('configuring storage...');
    const { client } = this.storage;

    for (const visibility of Object.values(BucketVisibility)) {
      const bucket = this.bucketFor(visibility);
      if (!(await client.bucketExists(bucket))) {
        console.info(`creating storage bucket ${bucket}...`);
        await client.createBucket(bucket);
      }
    }
  }

  async upload({ file, resizeOptions, key, visibility = BucketVisibility.PUBLIC }: Upload) {
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    if (resizeOptions) {
      buffer = await this.images.resize(buffer, resizeOptions);
    }

    // Scan the final bytes before they ever reach storage; infected uploads are rejected.
    await this.scanBeforePersist(buffer);

    const bucket = this.bucketFor(visibility);
    const fileKey = key || publicId();
    await this.storage.client.putObject(bucket, fileKey, buffer, file.type || undefined);

    // Record the clean verdict so later webhook/read checks can trust it without re-scanning.
    if (this.virusScanner.isEnabled) {
      await this.storage.client.setObjectTagging(bucket, fileKey, scanTags(ScanStatus.CLEAN));
    }

    return { key: fileKey };
  }

  /**
   * Runs the configured virus scan over the upload bytes; rejects infected files
   * and fails closed when the scanner errors.
   */
  private async scanBeforePersist(buffer: Buffer): Promise<void> {
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
    return this.storage.client.getObject(this.bucketFor(visibility), key);
  }

  async remove(key: string, visibility: BucketVisibility = BucketVisibility.PUBLIC) {
    return this.storage.client.removeObject(this.bucketFor(visibility), key);
  }

  bucketFor(visibility: BucketVisibility): string {
    const { PROJECT_NAME, ENVIRONMENT } = this.configService.envs;
    return buildBucketName(PROJECT_NAME, ENVIRONMENT, visibility);
  }
}
