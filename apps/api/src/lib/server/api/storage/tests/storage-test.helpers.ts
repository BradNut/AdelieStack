import NodeClam from 'clamscan';
import type { HTTPException } from 'hono/http-exception';
import sharp, { type PngOptions, type ResizeOptions } from 'sharp';
import { type MockInstance, vi } from 'vitest';

/** The image library failing on its own account, so no upload can be to blame. */
export const IMAGE_LIBRARY_BROKEN = 'vips: unable to initialise thread pool';

const solidImage = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });

/** Builds a solid-colour PNG; `options` control how it is encoded. */
export const createPng = (width: number, height: number, options?: PngOptions) => solidImage(width, height).png(options).toBuffer();

/** Builds a solid-colour JPEG. */
export const createJpeg = (width: number, height: number) => solidImage(width, height).jpeg().toBuffer();

/** sharp's types rule out a null dimension but its code accepts one, so options built from untyped input can carry it. */
export const withNullDimensions = (options: { width?: number | null; height?: number | null }) => options as unknown as ResizeOptions;

/** Resolves with what `promise` rejects with, so a test can inspect the HTTP status and message. */
export const failureOf = (promise: Promise<unknown>) => promise.catch((error) => error) as Promise<HTTPException>;

/**
 * What the `clamscan` client resolves a stream scan with. `@types/clamscan` types `isInfected` as a
 * boolean, but clamscan 2.4.0 resolves it as `null` on a clamd read timeout or a reply it cannot parse.
 */
export type ClamVerdict = { isInfected: boolean | null; viruses: string[] };

/** Stands in for clamd: the real scanner's client resolves every stream scan with `verdict`. */
export const stubClamd = (verdict: ClamVerdict) => {
  const scanStream = vi.fn(async () => verdict);
  // `init` is overloaded and spyOn types it by the callback form; the scanner calls the promise form.
  const init = vi.spyOn(NodeClam.prototype, 'init') as unknown as MockInstance<(options: NodeClam.Options) => Promise<NodeClam>>;
  init.mockResolvedValue({ scanStream } as unknown as NodeClam);
  return { init, scanStream };
};
