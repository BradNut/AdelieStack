import { injectable } from '@needle-di/core';
import sharp, { type ResizeOptions } from 'sharp';

@injectable()
export class ImagesService {
  private async resize(fileBuffer: Buffer, resizeOptions: ResizeOptions) {
    return sharp(fileBuffer).resize(resizeOptions).toBuffer();
  }
}
