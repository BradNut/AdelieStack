import { Container } from '@needle-di/core';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImagesService } from '#lib/server/api/storage/images.service';

const createPng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();

const createService = () => new Container().get(ImagesService);

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

    it('rejects input that is not an image', async () => {
      await expect(createService().resize(Buffer.from('not an image'), { width: 10 })).rejects.toThrow();
    });
  });
});
