import { StatusCodes } from '@adelie/shared';
import { inject, injectable } from '@needle-di/core';
import { HTTPException } from 'hono/http-exception';
import sharp, { type ResizeOptions } from 'sharp';
import { LoggerService } from '#lib/server/api/common/services/logger.service';

/** A valid 1x1 PNG: if sharp cannot resize this, the fault is in the server, not the upload. */
const KNOWN_GOOD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC',
  'base64',
);
const OUT_OF_MEMORY_PATTERN = /out of memory/i;

@injectable()
export class ImagesService {
  constructor(private readonly loggerService = inject(LoggerService)) {}

  /** Resizes an image. Failures are HTTPExceptions whose messages never carry the image library's own text. */
  async resize(fileBuffer: Buffer, resizeOptions: ResizeOptions): Promise<Buffer> {
    this.assertValidOptions(resizeOptions);

    try {
      return await sharp(fileBuffer).resize(resizeOptions).toBuffer();
    } catch (error) {
      if (await this.isCausedByServer(error)) {
        this.loggerService.log.error({ err: error }, 'Image processing failed');
        throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, { message: 'The image could not be processed. Please try again later.' });
      }
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, {
        message: 'File rejected: it is not a valid image or cannot be resized as requested.',
      });
    }
  }

  /** sharp validates options as the pipeline is built, so building one with no input tests only the options. */
  private assertValidOptions(resizeOptions: ResizeOptions) {
    try {
      sharp().resize(resizeOptions);
    } catch {
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, { message: 'Invalid image resize options.' });
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
