import { StatusCodes } from '@adelie/shared';
import { Container } from '@needle-di/core';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import sharp, { type ResizeOptions } from 'sharp';
import { onError } from 'stoker/middlewares';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLocale } from '#lib/server/api/common/middleware/locale.middleware';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import type { HonoEnv } from '#lib/server/api/common/utils/hono';
import { ImagesService } from '#lib/server/api/storage/images.service';
import { createLoggerServiceMock } from '../../../../../test/mocks/logger.mock';
import { createJpeg, createPng, failureOf, IMAGE_LIBRARY_BROKEN, withNullDimensions } from './storage-test.helpers';

const createService = (logger = createLoggerServiceMock()) => {
  const container = new Container();
  container.bind({ provide: LoggerService, useValue: logger as unknown as LoggerService });
  return container.get(ImagesService);
};

const firstHalf = (bytes: Buffer) => bytes.subarray(0, Math.floor(bytes.length / 2));

/** Resizes inside a request sent with `Accept-Language: locale` and returns the error message the client receives. */
const localisedFailure = async (locale: string, bytes: Buffer, options: ResizeOptions) => {
  const app = new Hono<HonoEnv>()
    .use(contextStorage())
    .use(requestLocale)
    .get('/', async (c) => {
      await createService().resize(bytes, options);
      return c.body(null);
    })
    .onError(onError);

  const response = await app.request('/', { headers: { 'accept-language': locale } });
  return ((await response.json()) as { message: string }).message;
};

describe('ImagesService', () => {
  describe('resize', () => {
    it('produces an image with the requested dimensions', async () => {
      const resized = await createService().resize(await createPng(40, 20), { width: 10, height: 10 });

      const { width, height } = await sharp(resized).metadata();
      expect({ width, height }).toEqual({ width: 10, height: 10 });
    });

    it('keeps the aspect ratio when only one dimension is requested', async () => {
      const resized = await createService().resize(await createPng(40, 20), { width: 10 });

      const { width, height } = await sharp(resized).metadata();
      expect({ width, height }).toEqual({ width: 10, height: 5 });
    });

    it('keeps the source image format', async () => {
      const resized = await createService().resize(await createPng(40, 20), { width: 10 });

      const { format } = await sharp(resized).metadata();
      expect(format).toBe('png');
    });

    it.each([
      ['bytes that are not an image', async () => Buffer.from('not an image')],
      ['an empty file', async () => Buffer.alloc(0)],
      ['a PNG cut off inside its header', async () => (await createPng(40, 20)).subarray(0, 12)],
      ['a PNG cut off inside its pixel data', async () => firstHalf(await createPng(200, 100, { compressionLevel: 0 }))],
      ['a JPEG cut off inside its pixel data', async () => firstHalf(await createJpeg(200, 100))],
    ])('refuses %s as a client error', async (_label, input) => {
      const error = await failureOf(createService().resize(await input(), { width: 10 }));

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    });

    it('keeps a trace of why an upload was refused, without telling the client', async () => {
      const logger = createLoggerServiceMock();

      const error = await failureOf(createService(logger).resize(Buffer.from('not an image'), { width: 10 }));

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(error.message).not.toMatch(/unsupported image format/i);
      expect(logger.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ message: expect.stringMatching(/unsupported image format/i) }) }),
        expect.any(String),
      );
    });

    it.each([
      ['a width of zero', { width: 0 }],
      ['a negative width', { width: -1 }],
      ['a fractional width', { width: 1.5 }],
      ['a height of zero', { height: 0 }],
      ['an unknown fit', { width: 10, fit: 'nope' }],
    ] as [string, ResizeOptions][])('refuses %s as invalid resize options', async (_label, options) => {
      const error = await failureOf(createService().resize(await createPng(40, 20), options));

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(error.message).toMatch(/resize options/i);
    });

    it('reports invalid options ahead of undecodable bytes', async () => {
      const error = await failureOf(createService().resize(Buffer.from('not an image'), { width: 0 }));

      expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
      expect(error.message).toMatch(/resize options/i);
    });

    it.each([
      ['de', 'bytes that are not an image', 'Datei abgelehnt: Sie ist kein gültiges Bild oder lässt sich nicht wie angefordert skalieren.'],
      ['es', 'bytes that are not an image', 'Archivo rechazado: no es una imagen válida o no se puede redimensionar como se solicitó.'],
    ])('refuses an upload in the language of the request (%s, %s)', async (locale, _label, message) => {
      await expect(localisedFailure(locale, Buffer.from('not an image'), { width: 10 })).resolves.toBe(message);
    });

    it.each([
      ['de', 'Ungültige Optionen für die Bildskalierung.'],
      ['es', 'Opciones de redimensionamiento de imagen no válidas.'],
    ])('refuses invalid resize options in the language of the request (%s)', async (locale, message) => {
      await expect(localisedFailure(locale, await createPng(40, 20), { width: 0 })).resolves.toBe(message);
    });

    describe("when the failure is not the client's fault", () => {
      // Observed from sharp 0.35 under a memory cap; the same process still resized a small image straight after.
      const OUT_OF_MEMORY = 'vips_tracked: out of memory -- size == 1144MB';
      // libjpeg's wording for the same failure, as sharp reports it.
      const JPEG_OUT_OF_MEMORY = 'VipsJpeg: Insufficient memory (case 4)';

      const failToBuffer = (message: string) => vi.spyOn(sharp.prototype, 'toBuffer').mockRejectedValue(new Error(message));

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('reports a server error when the image library cannot process even a known-good image', async () => {
        const png = await createPng(40, 20);
        failToBuffer(IMAGE_LIBRARY_BROKEN);

        const error = await failureOf(createService().resize(png, { width: 10 }));

        expect(error.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      });

      it.each([
        ['libvips', OUT_OF_MEMORY],
        ['the JPEG decoder', JPEG_OUT_OF_MEMORY],
      ])('reports a server error when %s runs out of memory, even though a small image still works', async (_label, message) => {
        const png = await createPng(40, 20);
        vi.spyOn(sharp.prototype, 'toBuffer').mockRejectedValueOnce(new Error(message));

        const error = await failureOf(createService().resize(png, { width: 10 }));

        expect(error.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      });

      it.each([
        ['de', 'Das Bild konnte nicht verarbeitet werden. Bitte versuchen Sie es später erneut.'],
        ['es', 'No se pudo procesar la imagen. Inténtalo de nuevo más tarde.'],
      ])('reports a server error in the language of the request (%s)', async (locale, message) => {
        const png = await createPng(40, 20);
        failToBuffer(IMAGE_LIBRARY_BROKEN);

        await expect(localisedFailure(locale, png, { width: 10 })).resolves.toBe(message);
      });

      it('keeps the image library error out of the message and in the log', async () => {
        const png = await createPng(40, 20);
        const logger = createLoggerServiceMock();
        failToBuffer(IMAGE_LIBRARY_BROKEN);

        const error = await failureOf(createService(logger).resize(png, { width: 10 }));

        expect(error.message).not.toMatch(/vips|thread pool/i);
        expect(logger.log.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.objectContaining({ message: IMAGE_LIBRARY_BROKEN }) }),
          expect.any(String),
        );
      });
    });

    describe('limits', () => {
      const LIMITS = { maxInputPixels: 1_000, maxOutputDimension: 100 };

      it('refuses an input beyond the declared pixel limit, without decoding it', async () => {
        const png = await createPng(40, 40);
        const toBuffer = vi.spyOn(sharp.prototype, 'toBuffer');

        const error = await failureOf(createService().resize(png, { width: 10 }, LIMITS));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/too many pixels/i);
        expect(toBuffer).not.toHaveBeenCalled();
        toBuffer.mockRestore();
      });

      it('accepts an input of exactly the declared pixel limit', async () => {
        await expect(createService().resize(await createPng(40, 25), { width: 10 }, LIMITS)).resolves.toBeInstanceOf(Buffer);
      });

      it('accepts an output of exactly the declared dimension', async () => {
        const resized = await createService().resize(await createPng(10, 10), { width: 100, height: 100 }, LIMITS);

        const { width, height } = await sharp(resized).metadata();
        expect({ width, height }).toEqual({ width: 100, height: 100 });
      });

      it.each([
        ['a width', 10, 10, { width: 101 }],
        ['a height', 10, 10, { height: 101 }],
        ['both dimensions, one too large', 10, 10, { width: 50, height: 101 }],
        ['a width that a tall image scales into too great a height', 2, 200, { width: 60 }],
        ['a height that a wide image scales into too great a width', 200, 2, { height: 60 }],
        ['an outside fit that scales past the limit', 2, 200, { width: 60, height: 60, fit: 'outside' }],
        ['a width beside a null height, which scales like a lone width', 2, 200, withNullDimensions({ width: 60, height: null })],
        ['a height beside a null width, which scales like a lone height', 200, 2, withNullDimensions({ width: null, height: 60 })],
      ] satisfies [string, number, number, ResizeOptions][])(
        'refuses %s beyond the declared maximum',
        async (_label, sourceWidth, sourceHeight, options) => {
          const png = await createPng(sourceWidth, sourceHeight);
          const toBuffer = vi.spyOn(sharp.prototype, 'toBuffer');

          const error = await failureOf(createService().resize(png, options, { maxInputPixels: 1_000_000, maxOutputDimension: 100 }));

          expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
          expect(error.message).toMatch(/size is too large/i);
          expect(toBuffer).not.toHaveBeenCalled();
          toBuffer.mockRestore();
        },
      );

      it('applies a default output limit when the caller declares none', async () => {
        const error = await failureOf(createService().resize(await createPng(40, 20), { width: 50_000, height: 50_000 }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/size is too large/i);
      });

      it('applies a default pixel limit when the caller declares none', async () => {
        const error = await failureOf(createService().resize(await createPng(8_000, 8_000, { compressionLevel: 1 }), { width: 10 }));

        expect(error.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
        expect(error.message).toMatch(/too many pixels/i);
      });

      it.each([
        ['de', 'Datei abgelehnt: Das Bild hat zu viele Pixel.'],
        ['es', 'Archivo rechazado: la imagen tiene demasiados píxeles.'],
      ])('refuses too many pixels in the language of the request (%s)', async (locale, message) => {
        await expect(localisedFailure(locale, await createPng(8_000, 8_000, { compressionLevel: 1 }), { width: 10 })).resolves.toBe(message);
      });
    });
  });
});
