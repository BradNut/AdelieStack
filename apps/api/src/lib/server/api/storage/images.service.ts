import { MAX_IMAGE_INPUT_PIXELS, MAX_IMAGE_OUTPUT_DIMENSION, StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import sharp, { type ResizeOptions } from 'sharp';
import { m } from '#lib/server/api/common/i18n/index';
import { LoggerService } from '#lib/server/api/common/services/logger.service';
import { InternalError, UnprocessableEntity } from '#lib/server/api/common/utils/exceptions';
import type { ImageLimits } from './storage.types';

/** A valid 1x1 PNG: if sharp cannot resize this, the fault is in the server, not the upload. */
const KNOWN_GOOD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC',
  'base64',
);
/** libvips says "out of memory"; libjpeg says "Insufficient memory (case N)". */
const OUT_OF_MEMORY_PATTERN = /out of memory|insufficient memory/i;

const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxInputPixels: MAX_IMAGE_INPUT_PIXELS,
  maxOutputDimension: MAX_IMAGE_OUTPUT_DIMENSION,
};

interface Dimensions {
  width: number;
  height: number;
}

/**
 * The size a resize aims for. A lone dimension or an `outside` fit scales the other side, which can far exceed what was asked for.
 * sharp's types rule out a null dimension but it treats one as absent, so null has to count as absent here too.
 */
const plannedOutput = (source: Dimensions, { width, height, fit }: ResizeOptions): Dimensions => {
  if (width != null && height != null && fit !== 'outside') return { width, height };

  const scale = Math.max((width ?? 0) / source.width, (height ?? 0) / source.height);
  return { width: source.width * scale, height: source.height * scale };
};

@injectable()
export class ImagesService {
  constructor(private readonly loggerService = inject(LoggerService)) {}

  /** Resizes an image. Failures are HTTPExceptions whose messages never carry the image library's own text. */
  async resize(fileBuffer: Buffer, resizeOptions: ResizeOptions, limits: ImageLimits = DEFAULT_IMAGE_LIMITS): Promise<Buffer> {
    this.assertValidOptions(resizeOptions);

    try {
      // Reading the header decodes nothing, so sizes can be refused here; `false` leaves that decision to the declared limit.
      const source = await sharp(fileBuffer, { limitInputPixels: false }).metadata();
      this.assertWithinLimits(source, resizeOptions, limits);

      return await sharp(fileBuffer, { limitInputPixels: limits.maxInputPixels }).resize(resizeOptions).toBuffer();
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      if (await this.isCausedByServer(error)) {
        this.loggerService.log.error({ err: error }, 'Image processing failed');
        throw InternalError(m.storage_image_processing_failed());
      }
      this.loggerService.log.warn({ err: error }, 'Image refused as unprocessable');
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, { message: m.storage_image_unprocessable() });
    }
  }

  /** sharp validates options as the pipeline is built, so building one with no input tests only the options. */
  private assertValidOptions(resizeOptions: ResizeOptions) {
    try {
      sharp().resize(resizeOptions);
    } catch {
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, { message: m.storage_image_invalid_resize_options() });
    }
  }

  private assertWithinLimits(source: Dimensions, resizeOptions: ResizeOptions, limits: ImageLimits) {
    if (source.width * source.height > limits.maxInputPixels) {
      throw UnprocessableEntity(m.storage_image_too_many_pixels());
    }

    const output = plannedOutput(source, resizeOptions);
    if (Math.max(output.width, output.height) > limits.maxOutputDimension) {
      throw UnprocessableEntity(m.storage_image_output_too_large());
    }
  }

  /**
   * sharp throws a plain Error for everything, worded differently per codec (a truncated PNG even reports
   * "unable to write to target"), so failures cannot be told apart by listing messages. Instead, a pipeline that
   * fails while a known-good image still resizes points at this upload. Running out of memory is the exception:
   * small images keep working through it, so it is the one failure identified by its message.
   */
  private async isCausedByServer(error: unknown): Promise<boolean> {
    if (error instanceof Error && OUT_OF_MEMORY_PATTERN.test(error.message)) return true;

    try {
      await sharp(KNOWN_GOOD_PNG).resize({ width: 1 }).toBuffer();
      return false;
    } catch {
      return true;
    }
  }
}
