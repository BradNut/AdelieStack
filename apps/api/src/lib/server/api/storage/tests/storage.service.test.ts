import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES, StatusCodes } from '@adelie/shared';
import { Container } from '@needle-di/core';
import NodeClam from 'clamscan';
import type { HTTPException } from 'hono/http-exception';
import sharp, { type ResizeOptions } from 'sharp';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ConfigService } from '#lib/server/api/common/configs/config.service';
import type { EnvsDto } from '#lib/server/api/common/configs/dtos/env.dto';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { ActiveContentType, CONTENT_SNIFF_BYTES } from '#lib/server/api/storage/content-type';
import { ImagesService } from '#lib/server/api/storage/images.service';
import { S3StorageClient } from '#lib/server/api/storage/s3-storage.client';
import { BucketVisibility } from '#lib/server/api/storage/storage.buckets';
import { StorageService } from '#lib/server/api/storage/storage.service';
import { ScanStatus, ScanTag, type Upload } from '#lib/server/api/storage/storage.types';
import { type ScanResponse, ScanResult, VirusScannerService } from '#lib/server/api/storage/virus-scanner.service';
import { createConfigServiceMock } from '../../../../../test/mocks/config.mock';
import { createLoggerServiceMock } from '../../../../../test/mocks/logger.mock';
import { createJpeg, createPng, failureOf, IMAGE_LIBRARY_BROKEN, withNullDimensions } from './storage-test.helpers';

const envs: Partial<EnvsDto> = {
  ANTIVIRUS_ENABLED: false,
  PROJECT_NAME: 'adelie',
  ENVIRONMENT: 'development',
  STORAGE_HOST: 'localhost',
  STORAGE_PORT: 8333,
  STORAGE_SSL: false,
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
};

/** A Public Id: 21 characters from 0-9A-Za-z. */
const PUBLIC_ID_PATTERN = /^[0-9A-Za-z]{21}$/;

const PUBLIC_BUCKET = 'adelie-public-development';
const PRIVATE_BUCKET = 'adelie-private-development';

const IMAGE_KEY = 'img';
const PNG_CONTENT_TYPE = 'image/png';
const UNUSED_RESIZE_RESULT = Buffer.from('should-not-be-stored');

/** What every upload has to state: the limits it is held to and the bucket it goes to. */
const IMAGE_UPLOAD = { maxSizeBytes: MAX_UPLOAD_SIZE_BYTES, acceptedTypes: ACCEPTED_IMAGE_TYPES, visibility: BucketVisibility.PUBLIC };

type ServiceBindings = {
  scanner?: Partial<VirusScannerService>;
  images?: Partial<ImagesService>;
};

/** Builds a StorageService; pass a stub to drive the virus scanner or observe ImagesService directly. */
const createService = ({ scanner, images }: ServiceBindings = {}) => {
  const container = new Container();
  container.bind({ provide: ConfigService, useValue: createConfigServiceMock(envs) as unknown as ConfigService });
  container.bind({ provide: LoggerService, useValue: createLoggerServiceMock() as unknown as LoggerService });
  if (scanner) container.bind({ provide: VirusScannerService, useValue: scanner as VirusScannerService });
  if (images) container.bind({ provide: ImagesService, useValue: images as ImagesService });
  return container.get(StorageService);
};

const scanStub = (scanBuffer: () => Promise<ScanResponse>): Partial<VirusScannerService> => ({
  isEnabled: true,
  scanBuffer: vi.fn(scanBuffer),
});

const pngFile = (bytes: Buffer) => new File([new Uint8Array(bytes)], 'image.png', { type: PNG_CONTENT_TYPE });

const dimensionsOf = async (bytes: Buffer) => {
  const { width, height } = await sharp(bytes).metadata();
  return { width, height };
};

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

    describe('when another instance races to create a bucket', () => {
      it('continues when the create failed because the bucket now exists', async () => {
        vi.spyOn(S3StorageClient.prototype, 'bucketExists')
          .mockResolvedValueOnce(false) // public: absent on the first look
          .mockResolvedValueOnce(true) // public: there on the re-check, the other instance won
          .mockResolvedValueOnce(true); // private: already there
        const createBucket = vi.spyOn(S3StorageClient.prototype, 'createBucket').mockRejectedValue(new Error('BucketAlreadyOwnedByYou'));

        await expect(createService().configure()).resolves.toBeUndefined();

        expect(createBucket).toHaveBeenCalledTimes(1);
        expect(createBucket).toHaveBeenCalledWith(PUBLIC_BUCKET);
      });

      it('rethrows the original create error when the bucket is still absent', async () => {
        vi.spyOn(S3StorageClient.prototype, 'bucketExists').mockResolvedValue(false);
        vi.spyOn(S3StorageClient.prototype, 'createBucket').mockRejectedValue(new Error('AccessDenied'));

        await expect(createService().configure()).rejects.toThrow('AccessDenied');
      });

      it('rethrows the original create error when the re-check itself fails', async () => {
        vi.spyOn(S3StorageClient.prototype, 'bucketExists').mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('connection reset'));
        vi.spyOn(S3StorageClient.prototype, 'createBucket').mockRejectedValue(new Error('AccessDenied'));

        await expect(createService().configure()).rejects.toThrow('AccessDenied');
      });
    });
  });

  describe('upload', () => {
    it('uploads to the stated bucket under the given key', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const png = await createPng(4, 4);

      const result = await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(png), key: 'my-key' });

      expect(result).toEqual({ key: 'my-key' });
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'my-key', png, PNG_CONTENT_TYPE);
    });

    it('generates a key and targets the private bucket when requested', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const png = await createPng(4, 4);

      const result = await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(png), visibility: BucketVisibility.PRIVATE });

      expect(result.key).toMatch(PUBLIC_ID_PATTERN);
      expect(putObject).toHaveBeenCalledWith(PRIVATE_BUCKET, result.key, png, PNG_CONTENT_TYPE);
    });

    it('propagates upload failures', async () => {
      vi.spyOn(S3StorageClient.prototype, 'putObject').mockRejectedValue(new Error('upload failed'));

      await expect(createService().upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(4, 4)) })).rejects.toThrow('upload failed');
    });
  });

  describe('upload limits', () => {
    it('makes every caller state the limits and the bucket', () => {
      expectTypeOf<Upload['maxSizeBytes']>().toEqualTypeOf<number>();
      expectTypeOf<Upload['acceptedTypes']>().toEqualTypeOf<readonly string[]>();
      expectTypeOf<Upload['visibility']>().toEqualTypeOf<BucketVisibility>();
      expectTypeOf<StorageService['get']>().parameter(1).toEqualTypeOf<BucketVisibility>();
      expectTypeOf<StorageService['remove']>().parameter(1).toEqualTypeOf<BucketVisibility>();
    });

    const HTML = '<!doctype html><html><body><script>alert(1)</script></body></html>';
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const XML_DECLARED_SVG = '<?xml version="1.0"?>\n<!-- a logo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const PDF = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n';

    const fileOf = (content: string | Buffer, claimedType: string) =>
      new File([typeof content === 'string' ? content : new Uint8Array(content)], 'upload', { type: claimedType });
    const storing = () => vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();

    it('accepts a file of exactly the declared size', async () => {
      const putObject = storing();
      const png = await createPng(4, 4);

      await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(png), maxSizeBytes: png.byteLength });

      expect(putObject).toHaveBeenCalledOnce();
    });

    it('refuses a file over the declared size with a 413, without reading it or storing anything', async () => {
      const putObject = storing();
      const png = await createPng(4, 4);
      const file = pngFile(png);
      const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file, maxSizeBytes: png.byteLength - 1 }));

      expect(error.status).toBe(StatusCodes.REQUEST_TOO_LONG);
      expect(error.message).toMatch(/larger/i);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(putObject).not.toHaveBeenCalled();
    });

    it('refuses a type the caller did not list with a 415, without reading the whole file or storing anything', async () => {
      const putObject = storing();
      const file = fileOf(await createJpeg(4, 4), 'image/jpeg');
      const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file, acceptedTypes: [PNG_CONTENT_TYPE] }));

      expect(error.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(error.message).toMatch(/not accepted/i);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(putObject).not.toHaveBeenCalled();
    });

    it("judges a file by its bytes when the client's claimed type is an accepted one", async () => {
      const putObject = storing();

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf(PDF, PNG_CONTENT_TYPE) }));

      expect(error.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('stores the type found in the bytes, not the one the client claimed', async () => {
      const putObject = storing();
      const jpeg = await createJpeg(4, 4);

      await createService().upload({ ...IMAGE_UPLOAD, file: fileOf(jpeg, PNG_CONTENT_TYPE), key: IMAGE_KEY });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, jpeg, 'image/jpeg');
    });

    it('stores the detected type when the client claimed none', async () => {
      const putObject = storing();
      const png = await createPng(4, 4);

      await createService().upload({ ...IMAGE_UPLOAD, file: fileOf(png, ''), key: IMAGE_KEY });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, png, PNG_CONTENT_TYPE);
    });

    it('accepts a non-image type when the caller lists it', async () => {
      const putObject = storing();

      await createService().upload({ ...IMAGE_UPLOAD, file: fileOf(PDF, ''), key: IMAGE_KEY, acceptedTypes: ['application/pdf'] });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, Buffer.from(PDF), 'application/pdf');
    });

    it.each([
      ['HTML', HTML],
      ['HTML behind a byte order mark and whitespace', `\uFEFF  \n${HTML}`],
      ['SVG', SVG],
      ['SVG behind an XML declaration and a comment', XML_DECLARED_SVG],
    ])('refuses %s claiming to be an image', async (_label, content) => {
      const putObject = storing();

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf(content, PNG_CONTENT_TYPE) }));

      expect(error.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('does not take SVG for XML when the caller accepts only XML', async () => {
      const putObject = storing();

      const error = await failureOf(
        createService().upload({ ...IMAGE_UPLOAD, file: fileOf(XML_DECLARED_SVG, 'application/xml'), acceptedTypes: ['application/xml'] }),
      );

      expect(error.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(putObject).not.toHaveBeenCalled();
    });

    it.each([
      ['HTML', HTML, ActiveContentType.HTML],
      ['SVG', SVG, ActiveContentType.SVG],
      ['SVG behind an XML declaration', XML_DECLARED_SVG, ActiveContentType.SVG],
    ])('accepts %s only when the caller explicitly lists it', async (_label, content, type) => {
      const putObject = storing();

      await createService().upload({ ...IMAGE_UPLOAD, file: fileOf(content, ''), key: IMAGE_KEY, acceptedTypes: [type] });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, Buffer.from(content), type);
    });

    it('refuses markup whose root lies beyond what is read, even when the caller accepts XML', async () => {
      const putObject = storing();
      const padded = `<?xml version="1.0"?><!--${'x'.repeat(CONTENT_SNIFF_BYTES)}-->${SVG}`;

      const error = await failureOf(
        createService().upload({ ...IMAGE_UPLOAD, file: fileOf(padded, 'application/xml'), acceptedTypes: ['application/xml'] }),
      );

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('keeps plain XML that contains a body element as XML', async () => {
      const putObject = storing();
      const xml = '<?xml version="1.0"?><note><body>hi</body></note>';

      await createService().upload({ ...IMAGE_UPLOAD, file: fileOf(xml, ''), key: IMAGE_KEY, acceptedTypes: ['application/xml'] });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, Buffer.from(xml), 'application/xml');
    });

    it('classifies a document embedding SVG as HTML', async () => {
      const putObject = storing();
      const page = '<!doctype html><html><body><svg></svg></body></html>';

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf(page, ''), acceptedTypes: ['image/svg+xml'] }));

      expect(error.status).toBe(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
      expect(putObject).not.toHaveBeenCalled();
    });

    it.each([
      ['bytes of no recognisable type', 'just some text'],
      ['a single byte, the smallest file that is not empty', 'x'],
    ])('refuses %s with a 422 and stores nothing', async (_label, content) => {
      const putObject = storing();

      const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf(content, PNG_CONTENT_TYPE) }));

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(error.message).toMatch(/recogni[sz]ed/i);
      expect(putObject).not.toHaveBeenCalled();
    });

    describe('when the file is empty', () => {
      const EVERY_RESIZE_REQUEST = [
        ['without resize options', undefined],
        ['with empty resize options', {}],
        ['with resize options', { width: 10 }],
      ] satisfies [string, ResizeOptions | undefined][];

      it.each(EVERY_RESIZE_REQUEST)('refuses an upload %s with a 422 that says the file is empty', async (_label, resizeOptions) => {
        const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf('', PNG_CONTENT_TYPE), resizeOptions }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/empty/i);
      });

      it.each(EVERY_RESIZE_REQUEST)('stops an upload %s before it is sniffed, resized, scanned or stored', async (_label, resizeOptions) => {
        const putObject = storing();
        const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
        const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));
        const resize = vi.fn(async () => UNUSED_RESIZE_RESULT);
        const file = fileOf('', PNG_CONTENT_TYPE);
        const slice = vi.spyOn(file, 'slice');

        await failureOf(createService({ scanner, images: { resize } }).upload({ ...IMAGE_UPLOAD, file, resizeOptions }));

        expect(slice).not.toHaveBeenCalled();
        expect(resize).not.toHaveBeenCalled();
        expect(scanner.scanBuffer).not.toHaveBeenCalled();
        expect(putObject).not.toHaveBeenCalled();
        expect(setObjectTagging).not.toHaveBeenCalled();
      });

      it.each([
        ['an accepted type', PNG_CONTENT_TYPE],
        ['an unlisted type', 'application/pdf'],
        ['no type', ''],
      ])('refuses it the same way when the client claimed %s', async (_label, claimedType) => {
        const putObject = storing();

        const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: fileOf('', claimedType) }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/empty/i);
        expect(putObject).not.toHaveBeenCalled();
      });
    });

    it.each([
      ['without resize options', undefined],
      ['with resize options', { width: 2 }],
    ] satisfies [string, ResizeOptions | undefined][])('still scans and stores a file that is not empty %s', async (_label, resizeOptions) => {
      const putObject = storing();
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));

      const result = await createService({ scanner }).upload({
        ...IMAGE_UPLOAD,
        file: pngFile(await createPng(4, 4)),
        key: IMAGE_KEY,
        resizeOptions,
      });

      expect(result).toEqual({ key: IMAGE_KEY });
      expect(scanner.scanBuffer).toHaveBeenCalledOnce();
      expect(putObject).toHaveBeenCalledOnce();
    });

    it('passes declared image limits on to image processing', async () => {
      storing();
      const original = await createPng(4, 4);
      const resize = vi.fn(async () => original);
      const imageLimits = { maxInputPixels: 100, maxOutputDimension: 50 };

      await createService({ images: { resize } }).upload({ ...IMAGE_UPLOAD, file: pngFile(original), resizeOptions: { width: 2 }, imageLimits });

      expect(resize).toHaveBeenCalledWith(original, { width: 2 }, imageLimits);
    });

    it('stores nothing when the requested size is beyond the limit', async () => {
      const putObject = storing();

      const error = await failureOf(
        createService().upload({
          ...IMAGE_UPLOAD,
          file: pngFile(await createPng(4, 4)),
          resizeOptions: { width: 100 },
          imageLimits: { maxInputPixels: 100, maxOutputDimension: 50 },
        }),
      );

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(putObject).not.toHaveBeenCalled();
    });
  });

  describe('upload resizing', () => {
    it('resizes through ImagesService and stores what it returns', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const original = await createPng(40, 20);
      const resizedBytes = await createJpeg(10, 5);
      const resize = vi.fn(async () => resizedBytes);

      await createService({ images: { resize } }).upload({ ...IMAGE_UPLOAD, file: pngFile(original), key: IMAGE_KEY, resizeOptions: { width: 10 } });

      expect(resize).toHaveBeenCalledWith(original, { width: 10 }, undefined);
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, resizedBytes, 'image/jpeg');
    });

    it('stores a resized SVG as the PNG the image library made of it', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>';

      await createService().upload({
        ...IMAGE_UPLOAD,
        file: new File([svg], 'logo.svg', { type: ActiveContentType.SVG }),
        acceptedTypes: [ActiveContentType.SVG],
        key: IMAGE_KEY,
        resizeOptions: { width: 10 },
      });

      const stored = putObject.mock.calls[0]?.[2] as Buffer;
      expect((await sharp(stored).metadata()).format).toBe('png');
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, stored, PNG_CONTENT_TYPE);
    });

    it('reports a server error and stores nothing when the resized bytes are of no known type', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const resize = vi.fn(async () => Buffer.from('not any known format'));

      const error = await failureOf(
        createService({ images: { resize } }).upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), resizeOptions: { width: 10 } }),
      );

      expect(error.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('stores an image with the requested dimensions', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();

      await createService().upload({
        ...IMAGE_UPLOAD,
        file: pngFile(await createPng(40, 20)),
        key: IMAGE_KEY,
        resizeOptions: { width: 10, height: 10 },
      });

      const stored = putObject.mock.calls[0]?.[2] as Buffer;
      await expect(dimensionsOf(stored)).resolves.toEqual({ width: 10, height: 10 });
    });

    it('stores an upload without resize options unchanged', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      // Uncompressed on purpose: sharp re-encodes a default PNG to identical bytes, which would hide a stray trip through it.
      const original = await createPng(40, 20, { compressionLevel: 0 });

      await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(original), key: IMAGE_KEY });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, original, PNG_CONTENT_TYPE);
    });

    it('stores an upload with empty resize options byte-identical to the file received', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      // Uncompressed on purpose: sharp re-encodes a default PNG to identical bytes, which would hide a stray trip through it.
      const original = await createPng(40, 20, { compressionLevel: 0 });

      await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(original), key: IMAGE_KEY, resizeOptions: {} });

      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, original, PNG_CONTENT_TYPE);
    });

    it('does not send an upload with empty resize options through image processing', async () => {
      vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const resize = vi.fn(async () => UNUSED_RESIZE_RESULT);

      await createService({ images: { resize } }).upload({
        ...IMAGE_UPLOAD,
        file: pngFile(await createPng(40, 20)),
        key: IMAGE_KEY,
        resizeOptions: {},
      });

      expect(resize).not.toHaveBeenCalled();
    });

    it.each([
      ['only undefined values', { width: undefined, height: undefined }],
      ['only null values', withNullDimensions({ width: null, height: null })],
      ['only a fit', { fit: 'cover' }],
      ['modifiers and no dimensions', { fit: 'contain', background: '#ffffff', withoutEnlargement: true }],
    ] satisfies [string, ResizeOptions][])('leaves an upload unchanged when the resize options have %s', async (_label, resizeOptions) => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const original = await createPng(40, 20, { compressionLevel: 0 });
      const resize = vi.fn(async () => UNUSED_RESIZE_RESULT);

      await createService({ images: { resize } }).upload({ ...IMAGE_UPLOAD, file: pngFile(original), key: IMAGE_KEY, resizeOptions });

      expect(resize).not.toHaveBeenCalled();
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, original, PNG_CONTENT_TYPE);
    });

    it('still resizes when only a height is requested', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();

      await createService().upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), key: IMAGE_KEY, resizeOptions: { height: 10 } });

      const stored = putObject.mock.calls[0]?.[2] as Buffer;
      await expect(dimensionsOf(stored)).resolves.toEqual({ width: 20, height: 10 });
    });

    it('still resizes when only some resize options are set', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();

      await createService().upload({
        ...IMAGE_UPLOAD,
        file: pngFile(await createPng(40, 20)),
        key: IMAGE_KEY,
        resizeOptions: { width: 10, height: undefined },
      });

      const stored = putObject.mock.calls[0]?.[2] as Buffer;
      await expect(dimensionsOf(stored)).resolves.toEqual({ width: 10, height: 5 });
    });

    it('scans an upload with empty resize options before anything reaches storage', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));
      const scanBuffer = vi.mocked(scanner.scanBuffer as VirusScannerService['scanBuffer']);
      const original = await createPng(40, 20, { compressionLevel: 0 });

      await createService({ scanner }).upload({ ...IMAGE_UPLOAD, file: pngFile(original), key: IMAGE_KEY, resizeOptions: {} });

      expect(scanBuffer).toHaveBeenCalledWith(original);
      expect(scanBuffer.mock.invocationCallOrder[0]).toBeLessThan(putObject.mock.invocationCallOrder[0] as number);
    });

    it('never persists an upload with empty resize options that scans as infected', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] }));

      const error = (await createService({ scanner })
        .upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), resizeOptions: {} })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(putObject).not.toHaveBeenCalled();
    });

    describe('when an upload cannot be resized', () => {
      /** Everything sharp was seen to put in its own messages, plus the library's own names. */
      const IMAGE_LIBRARY_INTERNALS = /sharp|vips|libpng|expected|input buffer|corrupt header|unsupported image format|positive integer/i;

      it('refuses a truncated image with a clear 422 and stores nothing', async () => {
        const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
        const file = pngFile((await createPng(200, 100, { compressionLevel: 0 })).subarray(0, 200));

        const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file, resizeOptions: { width: 10 } }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/not a valid image/i);
        expect(error.message).not.toMatch(IMAGE_LIBRARY_INTERNALS);
        expect(putObject).not.toHaveBeenCalled();
      });

      it('never reaches the virus scanner with a rejected upload', async () => {
        const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));

        await failureOf(
          createService({ scanner }).upload({
            ...IMAGE_UPLOAD,
            file: new File(['nope'], 'fake.png', { type: PNG_CONTENT_TYPE }),
            resizeOptions: { width: 10 },
          }),
        );

        expect(scanner.scanBuffer).not.toHaveBeenCalled();
      });

      it.each([
        ['a width of zero', { width: 0 }],
        ['a height of zero', { height: 0 }],
        ['a negative width', { width: -5 }],
      ] satisfies [string, ResizeOptions][])('refuses %s as a client error and stores nothing', async (_label, resizeOptions) => {
        const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();

        const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), resizeOptions }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).not.toMatch(IMAGE_LIBRARY_INTERNALS);
        expect(putObject).not.toHaveBeenCalled();
      });

      it('reports a failure of the image library as a server error, stores nothing and exposes no internals', async () => {
        const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
        const file = pngFile(await createPng(40, 20));
        vi.spyOn(sharp.prototype, 'toBuffer').mockRejectedValue(new Error(IMAGE_LIBRARY_BROKEN));

        const error = await failureOf(createService().upload({ ...IMAGE_UPLOAD, file, resizeOptions: { width: 10 } }));

        expect(error.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(error.message).not.toMatch(IMAGE_LIBRARY_INTERNALS);
        expect(putObject).not.toHaveBeenCalled();
      });

      it('still reports a storage failure after a successful resize as it is', async () => {
        vi.spyOn(S3StorageClient.prototype, 'putObject').mockRejectedValue(new Error('upload failed'));

        await expect(
          createService().upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), resizeOptions: { width: 10 } }),
        ).rejects.toThrow('upload failed');
      });
    });

    it('scans the resized bytes before anything reaches storage', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));
      const scanBuffer = vi.mocked(scanner.scanBuffer as VirusScannerService['scanBuffer']);

      await createService({ scanner }).upload({
        ...IMAGE_UPLOAD,
        file: pngFile(await createPng(40, 20)),
        key: IMAGE_KEY,
        resizeOptions: { width: 10 },
      });

      const scanned = scanBuffer.mock.calls[0]?.[0] as Buffer;
      await expect(dimensionsOf(scanned)).resolves.toEqual({ width: 10, height: 5 });
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, IMAGE_KEY, scanned, PNG_CONTENT_TYPE);
      expect(scanBuffer.mock.invocationCallOrder[0]).toBeLessThan(putObject.mock.invocationCallOrder[0] as number);
    });

    it('never persists a resized upload that scans as infected', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] }));

      const error = (await createService({ scanner })
        .upload({ ...IMAGE_UPLOAD, file: pngFile(await createPng(40, 20)), resizeOptions: { width: 10 } })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(putObject).not.toHaveBeenCalled();
    });
  });

  describe('upload virus scanning', () => {
    it('stores a clean file and tags it as scanned clean when antivirus is enabled', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.CLEAN }));
      const png = await createPng(4, 4);
      const file = pngFile(png);

      const result = await createService({ scanner }).upload({ ...IMAGE_UPLOAD, file, key: 'clean-key' });

      expect(result).toEqual({ key: 'clean-key' });
      expect(scanner.scanBuffer).toHaveBeenCalledWith(png);
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'clean-key', png, PNG_CONTENT_TYPE);
      expect(setObjectTagging).toHaveBeenCalledWith(PUBLIC_BUCKET, 'clean-key', expect.objectContaining({ [ScanTag.STATUS]: ScanStatus.CLEAN }));
    });

    it('rejects an infected file and never persists it', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.INFECTED, viruses: ['Eicar-Test-Signature'] }));
      const file = pngFile(await createPng(4, 4));

      const error = (await createService({ scanner })
        .upload({ ...IMAGE_UPLOAD, file })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(error.message).toContain('Eicar-Test-Signature');
      expect(putObject).not.toHaveBeenCalled();
    });

    it('fails closed and does not persist when the scanner errors', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const scanner = scanStub(async () => ({ result: ScanResult.ERROR, error: 'daemon unreachable' }));
      const file = pngFile(await createPng(4, 4));

      const error = (await createService({ scanner })
        .upload({ ...IMAGE_UPLOAD, file })
        .catch((e) => e)) as HTTPException;

      expect(error.status).toBe(503);
      expect(putObject).not.toHaveBeenCalled();
    });

    it('skips scanning entirely when antivirus is disabled', async () => {
      const putObject = vi.spyOn(S3StorageClient.prototype, 'putObject').mockResolvedValue();
      const setObjectTagging = vi.spyOn(S3StorageClient.prototype, 'setObjectTagging').mockResolvedValue();
      const initClamAv = vi.spyOn(NodeClam.prototype, 'init');
      const png = await createPng(4, 4);
      const file = pngFile(png);

      const result = await createService().upload({ ...IMAGE_UPLOAD, file, key: 'skip-key' });

      expect(result).toEqual({ key: 'skip-key' });
      expect(initClamAv).not.toHaveBeenCalled();
      expect(putObject).toHaveBeenCalledWith(PUBLIC_BUCKET, 'skip-key', png, PNG_CONTENT_TYPE);
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

      await expect(createService().get('nope', BucketVisibility.PUBLIC)).rejects.toThrow('missing');
    });
  });

  describe('remove', () => {
    it('deletes from the stated bucket', async () => {
      const removeObject = vi.spyOn(S3StorageClient.prototype, 'removeObject').mockResolvedValue();

      await createService().remove('k', BucketVisibility.PRIVATE);

      expect(removeObject).toHaveBeenCalledWith(PRIVATE_BUCKET, 'k');
    });
  });
});
