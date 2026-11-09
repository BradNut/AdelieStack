import type { ResizeOptions } from 'sharp';
import type { BucketVisibility } from './storage.buckets';

export type StorageClientConfig = {
  host: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
};

export type StoredObject = {
  body: Buffer;
  contentType: string | undefined;
};

/**
 * Lifecycle of an object's virus scan, recorded as an S3 object tag so access
 * decisions can be made without re-scanning.
 */
export const ScanStatus = {
  PENDING: 'pending',
  SCANNING: 'scanning',
  CLEAN: 'clean',
  INFECTED: 'infected',
  ERROR: 'error',
} as const;

export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

/** Object tag keys used to persist scan outcomes on stored objects. */
export const ScanTag = {
  STATUS: 'scan-status',
  TIMESTAMP: 'scan-timestamp',
  VIRUSES: 'scan-viruses',
} as const;

/** The object tags that record a scan outcome as of now. */
export const scanTags = (status: ScanStatus, viruses?: string[]): Record<string, string> => ({
  [ScanTag.STATUS]: status,
  [ScanTag.TIMESTAMP]: new Date().toISOString(),
  ...(viruses?.length ? { [ScanTag.VIRUSES]: viruses.join(',') } : {}),
});

/** How large an image may be going into, and coming out of, a resize. */
export type ImageLimits = {
  maxInputPixels: number;
  maxOutputDimension: number;
};

export type Upload = {
  file: File;
  key?: string;
  /** Largest file accepted. A larger one is refused before it is read. */
  maxSizeBytes: number;
  /** Types accepted, compared with what the file's bytes are. HTML and SVG are refused unless listed. */
  acceptedTypes: readonly string[];
  visibility: BucketVisibility;
  resizeOptions?: ResizeOptions;
  /** Limits for the resize; `ImagesService` applies its defaults when omitted. */
  imageLimits?: ImageLimits;
};
