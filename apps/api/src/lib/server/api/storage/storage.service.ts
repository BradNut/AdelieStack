import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { m } from '#lib/server/api/common/i18n/index';
import { publicId } from '#lib/server/api/common/utils/crypto';
import { InternalError, PayloadTooLarge, UnprocessableEntity, UnsupportedMediaType } from '#lib/server/api/common/utils/exceptions';
import { CONTENT_SNIFF_BYTES, detectContentType } from './content-type';
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
        await this.createBucketUnlessRaced(bucket);
      }
    }
  }

  /**
   * Another instance booting at the same moment can create the bucket between the check and the create.
   * Providers word that failure differently, so ask whether the bucket exists now instead of matching error names.
   */
  private async createBucketUnlessRaced(bucket: string) {
    const { client } = this.storage;
    try {
      await client.createBucket(bucket);
    } catch (createError) {
      const existsNow = await client.bucketExists(bucket).catch(() => false);
      if (!existsNow) throw createError;
    }
  }

  async upload({ file, maxSizeBytes, acceptedTypes, resizeOptions, imageLimits, key, visibility }: Upload): Promise<{ key: string }> {
    let contentType = await this.acceptedContentType(file, { maxSizeBytes, acceptedTypes });

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    // Only a width or height asks for a resize; without one, sharp would just re-encode the file.
    if (resizeOptions?.width != null || resizeOptions?.height != null) {
      buffer = await this.images.resize(buffer, resizeOptions, imageLimits);
      contentType = await this.detectResizedType(buffer);
    }

    // Scan the final bytes before they ever reach storage; infected uploads are rejected.
    await this.scanBeforePersist(buffer);

    const bucket = this.bucketFor(visibility);
    const fileKey = key || publicId();
    await this.storage.client.putObject(bucket, fileKey, buffer, contentType);

    // Record the clean verdict so later webhook/read checks can trust it without re-scanning.
    if (this.virusScanner.isEnabled) {
      await this.storage.client.setObjectTagging(bucket, fileKey, scanTags(ScanStatus.CLEAN));
    }

    return { key: fileKey };
  }

  /**
   * Returns the accepted type a file's first bytes show it to be; the client's claimed type is never trusted.
   * Throws instead when the file is empty, over the size limit or not of a listed type, reading no more than those bytes.
   */
  private async acceptedContentType(file: File, { maxSizeBytes, acceptedTypes }: Pick<Upload, 'maxSizeBytes' | 'acceptedTypes'>): Promise<string> {
    if (file.size === 0) {
      throw UnprocessableEntity(m.storage_upload_empty());
    }
    if (file.size > maxSizeBytes) {
      throw PayloadTooLarge(m.storage_upload_too_large());
    }

    const head = Buffer.from(await file.slice(0, CONTENT_SNIFF_BYTES).arrayBuffer());
    const contentType = await detectContentType(head);
    if (!contentType) {
      throw UnprocessableEntity(m.storage_upload_unrecognized());
    }
    if (!acceptedTypes.includes(contentType)) {
      throw UnsupportedMediaType(m.storage_upload_type_not_accepted());
    }
    return contentType;
  }

  /** A resize can change the format (sharp turns an SVG into a PNG), so what gets stored is identified afresh. */
  private async detectResizedType(resized: Buffer): Promise<string> {
    const contentType = await detectContentType(resized.subarray(0, CONTENT_SNIFF_BYTES));
    if (!contentType) throw InternalError(m.storage_image_processing_failed());
    return contentType;
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

  async get(key: string, visibility: BucketVisibility): Promise<StoredObject> {
    return this.storage.client.getObject(this.bucketFor(visibility), key);
  }

  async remove(key: string, visibility: BucketVisibility): Promise<void> {
    return this.storage.client.removeObject(this.bucketFor(visibility), key);
  }

  bucketFor(visibility: BucketVisibility): string {
    const { PROJECT_NAME, ENVIRONMENT } = this.configService.envs;
    return buildBucketName(PROJECT_NAME, ENVIRONMENT, visibility);
  }
}
