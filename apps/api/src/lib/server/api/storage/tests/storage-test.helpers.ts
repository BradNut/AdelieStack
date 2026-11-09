import type { HTTPException } from 'hono/http-exception';
import sharp, { type PngOptions } from 'sharp';

/** The image library failing on its own account, so no upload can be to blame. */
export const IMAGE_LIBRARY_BROKEN = 'vips: unable to initialise thread pool';

const solidImage = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });

/** Builds a solid-colour PNG; `options` control how it is encoded. */
export const createPng = (width: number, height: number, options?: PngOptions) => solidImage(width, height).png(options).toBuffer();

/** Builds a solid-colour JPEG. */
export const createJpeg = (width: number, height: number) => solidImage(width, height).jpeg().toBuffer();

/** Resolves with what `promise` rejects with, so a test can inspect the HTTP status and message. */
export const failureOf = (promise: Promise<unknown>) => promise.catch((error) => error) as Promise<HTTPException>;
