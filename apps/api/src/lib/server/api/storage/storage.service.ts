import { BINARY_CONTENT_TYPE, CONTENT_LENGTH_HEADER, CONTENT_TYPE_HEADER, StatusCodes, StorageErrorCode } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { m } from '#lib/server/api/common/i18n/index';
import { publicId } from '#lib/server/api/common/utils/crypto';
import {
  BadRequest,
  CodedHTTPException,
  InternalError,
  PayloadTooLarge,
  UnprocessableEntity,
  UnsupportedMediaType,
} from '#lib/server/api/common/utils/exceptions';
import { CONTENT_SNIFF_BYTES, detectContentType } from './content-type';
import { ImagesService } from './images.service';
import { S3StorageClientProvider } from './s3-storage.client';
import { BucketVisibility, buildBucketName } from './storage.buckets';
import { type ObjectStream, PresignedUrlLifetime, ScanStatus, ScanTag, type StoredObject, scanTags, type Upload } from './storage.types';
import { ScanResult, VirusScannerService } from './virus-scanner.service';

const isPresignedUrlLifetime = (seconds: number): boolean =>
  Number.isInteger(seconds) && seconds >= PresignedUrlLifetime.MIN_SECONDS && seconds <= PresignedUrlLifetime.MAX_SECONDS;

/** A key as a URL path: each folder segment encoded, the `/` between them kept. */
const encodeKeyPath = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

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
    // The bytes passed the scan above, so with antivirus on the object is stored already clean, in the same write:
    // reads refuse it until then (ADR 0016). With antivirus off nothing was scanned, so no Scan Status is written.
    const tags = this.virusScanner.isEnabled ? scanTags(ScanStatus.CLEAN) : undefined;
    await this.storage.client.putObject(bucket, fileKey, buffer, contentType, tags);

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

  /** Reads an object into memory. With antivirus on, only a clean object is read (see `assertReadable`). */
  async get(key: string, visibility: BucketVisibility): Promise<StoredObject> {
    const bucket = this.bucketFor(visibility);
    await this.assertReadable(bucket, key);
    return this.storage.client.getObject(bucket, key);
  }

  /**
   * Streams an object's body without buffering it, with the headers to send it under. A body of unknown type is
   * labelled binary; an unknown length is left out. With antivirus on, only a clean object is streamed.
   */
  async getObjectStream(key: string, visibility: BucketVisibility): Promise<ObjectStream> {
    const bucket = this.bucketFor(visibility);
    await this.assertReadable(bucket, key);
    const { stream, contentType, contentLength } = await this.storage.client.getObjectStream(bucket, key);
    return {
      stream,
      headers: {
        [CONTENT_TYPE_HEADER]: contentType ?? BINARY_CONTENT_TYPE,
        ...(contentLength === undefined ? {} : { [CONTENT_LENGTH_HEADER]: String(contentLength) }),
      },
    };
  }

  /**
   * A Presigned URL that lets its holder GET the object straight from storage, on `STORAGE_URL`, for
   * `expiresInSeconds` (one hour by default; a whole number of seconds from 1 second to 7 days, else a 400). With
   * antivirus on, the object must be clean when the URL is issued; that is the only check, so the URL keeps working
   * until it expires even if a later scan marks the object error (ADR 0016).
   */
  async getSignedUrl(key: string, visibility: BucketVisibility, expiresInSeconds: number = PresignedUrlLifetime.DEFAULT_SECONDS): Promise<string> {
    if (!isPresignedUrlLifetime(expiresInSeconds)) {
      throw BadRequest(m.storage_signed_url_lifetime_invalid());
    }
    const bucket = this.bucketFor(visibility);
    await this.assertReadable(bucket, key);
    return this.storage.presigner.presignedGetObject(bucket, key, expiresInSeconds);
  }

  /**
   * The URL a browser loads the object from. A public object's is its address under `PUBLIC_IMAGE_URI`; a private
   * object gets a Presigned URL (see `getSignedUrl`). Either way, with antivirus on, the object must be clean now.
   * A public object fetched straight from storage later is not checked again: its only protection is the scan at upload.
   */
  async getFileUrl(key: string, visibility: BucketVisibility, expiresInSeconds?: number): Promise<string> {
    if (visibility === BucketVisibility.PRIVATE) {
      return this.getSignedUrl(key, visibility, expiresInSeconds);
    }
    await this.assertReadable(this.bucketFor(visibility), key);
    return `${this.configService.envs.PUBLIC_IMAGE_URI.replace(/\/+$/, '')}/${encodeKeyPath(key)}`;
  }

  /**
   * The object's Scan Status as recorded, or `null` when it has none. A value outside `ScanStatus` is returned as it
   * is, so a caller sees what is stored. A failure to read the tags (an outage, a missing key) propagates.
   */
  async getScanStatus(key: string, visibility: BucketVisibility): Promise<string | null> {
    return this.scanStatusOf(this.bucketFor(visibility), key);
  }

  private async scanStatusOf(bucket: string, key: string): Promise<string | null> {
    const tags = await this.storage.client.getObjectTagging(bucket, key);
    return tags[ScanTag.STATUS] || null;
  }

  /**
   * With antivirus on, refuses a read unless the object's Scan Status is clean (ADR 0016); with it off, nothing is
   * checked. Runs before any bytes are fetched. An object with no Scan Status counts as pending, never as clean, and a
   * failure to read the tags propagates as it is rather than being reported as pending.
   */
  private async assertReadable(bucket: string, key: string): Promise<void> {
    if (!this.virusScanner.isEnabled) return;

    const status = await this.scanStatusOf(bucket, key);
    switch (status) {
      case ScanStatus.CLEAN:
        return;
      case null:
      case ScanStatus.PENDING:
      case ScanStatus.SCANNING:
        throw new CodedHTTPException(StatusCodes.TOO_EARLY, StorageErrorCode.SCAN_PENDING, m.storage_scan_pending());
      case ScanStatus.INFECTED:
        throw new CodedHTTPException(StatusCodes.GONE, StorageErrorCode.SCAN_INFECTED, m.storage_scan_infected());
      case ScanStatus.ERROR:
        throw new CodedHTTPException(StatusCodes.INTERNAL_SERVER_ERROR, StorageErrorCode.SCAN_FAILED, m.storage_scan_failed());
      default:
        throw new CodedHTTPException(StatusCodes.FORBIDDEN, StorageErrorCode.SCAN_REFUSED, m.storage_scan_refused());
    }
  }

  async remove(key: string, visibility: BucketVisibility): Promise<void> {
    return this.storage.client.removeObject(this.bucketFor(visibility), key);
  }

  bucketFor(visibility: BucketVisibility): string {
    const { PROJECT_NAME, ENVIRONMENT } = this.configService.envs;
    return buildBucketName(PROJECT_NAME, ENVIRONMENT, visibility);
  }
}
