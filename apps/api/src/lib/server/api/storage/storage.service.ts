import {
  BINARY_CONTENT_TYPE,
  CONTENT_DISPOSITION_HEADER,
  CONTENT_LENGTH_HEADER,
  CONTENT_TYPE_HEADER,
  MAX_OBJECT_KEY_LENGTH,
  StatusCodes,
  StorageErrorCode,
} from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import { m } from '#lib/server/api/common/i18n/index';
import { publicId } from '#lib/server/api/common/utils/crypto';
import {
  BadRequest,
  Conflict,
  Forbidden,
  Gone,
  InternalError,
  PayloadTooLarge,
  TooEarly,
  UnprocessableEntity,
  UnsupportedMediaType,
} from '#lib/server/api/common/utils/exceptions';
import { CONTENT_SNIFF_BYTES, detectContentType, isScriptCapable } from './content-type';
import { ImagesService } from './images.service';
import { ObjectAlreadyExistsError, S3StorageClientProvider } from './s3-storage.client';
import { BucketVisibility, buildBucketName } from './storage.buckets';
import {
  DOWNLOAD_DISPOSITION,
  OBJECT_KEY_PATTERN,
  type ObjectStream,
  PresignedUrlLifetime,
  ScanStatus,
  ScanTag,
  type StoredObject,
  scanTags,
  type Upload,
} from './storage.types';
import { ScanResult, VirusScannerService } from './virus-scanner.service';

const isValidObjectKey = (key: string): boolean => key.length <= MAX_OBJECT_KEY_LENGTH && OBJECT_KEY_PATTERN.test(key);

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

  /**
   * Stores a file that passes the upload checks and returns its key. A caller-supplied `key` must match
   * `OBJECT_KEY_PATTERN` (else a 400) and be free unless `overwrite` is set (else a 409). A script-capable type is
   * stored as a download unless `inlineActiveContent` is set.
   */
  async upload({
    file,
    maxSizeBytes,
    acceptedTypes,
    resizeOptions,
    imageLimits,
    key,
    overwrite = false,
    inlineActiveContent = false,
    visibility,
  }: Upload): Promise<{
    key: string;
  }> {
    if (key !== undefined && !isValidObjectKey(key)) {
      throw BadRequest(m.storage_upload_key_invalid());
    }

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
    const fileKey = key ?? publicId();
    const { client } = this.storage;
    // The write below is conditional too, but a provider may ignore the condition (SeaweedFS 3.79 does), so a
    // caller-supplied key is checked first. A generated key is a fresh Public Id, so only the condition guards it.
    if (key !== undefined && !overwrite && (await client.objectExists(bucket, fileKey))) {
      throw Conflict(m.storage_upload_key_taken());
    }

    // The bytes passed the scan above, so with antivirus on the object is stored already clean, in the same write:
    // reads refuse it until then (ADR 0016). With antivirus off nothing was scanned, so no Scan Status is written.
    const tags = this.virusScanner.isEnabled ? scanTags(ScanStatus.CLEAN) : undefined;
    const contentDisposition = isScriptCapable(contentType) && !inlineActiveContent ? DOWNLOAD_DISPOSITION : undefined;
    try {
      await client.putObject(bucket, fileKey, buffer, { contentType, tags, contentDisposition, onlyIfAbsent: !overwrite });
    } catch (error) {
      if (error instanceof ObjectAlreadyExistsError) throw Conflict(m.storage_upload_key_taken());
      throw error;
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

  /** Reads an object into memory. With antivirus on, only a clean object is read (see `assertReadable`). */
  async get(key: string, visibility: BucketVisibility): Promise<StoredObject> {
    return this.storage.client.getObject(await this.readableBucket(key, visibility), key);
  }

  /**
   * Streams an object's body without buffering it, with the headers to send it under. A body of unknown type is
   * labelled binary; an unknown length is left out, and a stored disposition is kept. With antivirus on, only a clean object is streamed.
   */
  async getObjectStream(key: string, visibility: BucketVisibility): Promise<ObjectStream> {
    const bucket = await this.readableBucket(key, visibility);
    const { stream, contentType, contentLength, contentDisposition } = await this.storage.client.getObjectStream(bucket, key);
    return {
      stream,
      headers: {
        [CONTENT_TYPE_HEADER]: contentType ?? BINARY_CONTENT_TYPE,
        ...(contentLength === undefined ? {} : { [CONTENT_LENGTH_HEADER]: String(contentLength) }),
        // An object stored as a download (see `upload`) stays one when the API serves it.
        ...(contentDisposition ? { [CONTENT_DISPOSITION_HEADER]: contentDisposition } : {}),
      },
    };
  }

  /**
   * A Presigned URL that lets its holder GET the object straight from storage, on `STORAGE_URL`, for
   * `expiresInSeconds` (one hour by default; a whole number of seconds from 1 second to 7 days, else a 400). With
   * antivirus on, the object must be clean when the URL is issued; that is the only check, so the URL keeps working
   * until it expires even if a later scan marks the object error (ADR 0016).
   */
  async getPresignedUrl(key: string, visibility: BucketVisibility, expiresInSeconds: number = PresignedUrlLifetime.DEFAULT_SECONDS): Promise<string> {
    if (!isPresignedUrlLifetime(expiresInSeconds)) {
      throw BadRequest(m.storage_presigned_url_lifetime_invalid());
    }
    return this.storage.presigner.presignedGetObject(await this.readableBucket(key, visibility), key, expiresInSeconds);
  }

  /**
   * The URL a browser loads the object from. A public object's is its address under `PUBLIC_IMAGE_URI`; a private
   * object gets a Presigned URL (see `getPresignedUrl`). Either way, with antivirus on, the object must be clean now.
   * A public object fetched straight from storage later is not checked again: its only protection is the scan at upload.
   */
  async getFileUrl(key: string, visibility: BucketVisibility, expiresInSeconds?: number): Promise<string> {
    if (visibility === BucketVisibility.PRIVATE) {
      return this.getPresignedUrl(key, visibility, expiresInSeconds);
    }
    await this.readableBucket(key, visibility);
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

  /** The bucket a read of `key` goes to, once `assertReadable` lets the read through. */
  private async readableBucket(key: string, visibility: BucketVisibility): Promise<string> {
    const bucket = this.bucketFor(visibility);
    await this.assertReadable(bucket, key);
    return bucket;
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
        throw TooEarly(m.storage_scan_pending(), StorageErrorCode.SCAN_PENDING);
      case ScanStatus.INFECTED:
        throw Gone(m.storage_scan_infected(), StorageErrorCode.SCAN_INFECTED);
      case ScanStatus.ERROR:
        throw InternalError(m.storage_scan_failed(), StorageErrorCode.SCAN_FAILED);
      default:
        throw Forbidden(m.storage_scan_refused(), StorageErrorCode.SCAN_REFUSED);
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
