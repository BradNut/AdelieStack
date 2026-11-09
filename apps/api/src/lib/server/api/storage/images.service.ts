import { injectable } from '@needle-di/core';
import sharp, { type ResizeOptions } from 'sharp';

@injectable()
export class ImagesService {
  async resize(fileBuffer: Buffer, resizeOptions: ResizeOptions): Promise<Buffer> {
    return sharp(fileBuffer).resize(resizeOptions).toBuffer();
  }
}
