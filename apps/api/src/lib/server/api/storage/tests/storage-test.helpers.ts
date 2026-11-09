import sharp, { type PngOptions } from 'sharp';

/** Builds a solid-colour PNG; `options` control how it is encoded. */
export const createPng = (width: number, height: number, options?: PngOptions) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png(options)
    .toBuffer();
