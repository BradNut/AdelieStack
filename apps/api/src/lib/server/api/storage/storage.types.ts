import { SECONDS_PER_DAY, SECONDS_PER_MINUTE } from '@adelie/shared';
import type { ResizeOptions } from 'sharp';
import type { BucketVisibility } from './storage.buckets';

/** The access key pair the API authenticates to storage with (`STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`). */
export interface StorageCredentials {
  accessKey: string;
  secretKey: string;
}

export interface StorageClientConfig extends StorageCredentials {
  host: string;
  port: number;
  useSSL: boolean;
}

/** What signs Presigned URLs: the browser-facing storage address (`STORAGE_URL`) and the storage credentials. */
export interface PresignerConfig extends StorageCredentials {
  endpoint: string;
}

/** How `S3StorageClient.putObject` stores an object. */
export interface PutObjectOptions {
  contentType?: string;
  /** Object tags, written in the same request as the body. */
  tags?: Record<string, string>;
  /** The `Content-Disposition` storage serves the object with. */
  contentDisposition?: string;
  /** Store the object only if no object has the key yet. */
  onlyIfAbsent?: boolean;
}

export type StoredObject = {
  body: Buffer;
  contentType: string | undefined;
};

/** A stored object's body as a stream, with what the storage reported about it. */
export interface StoredObjectStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number | undefined;
  /** The `Content-Disposition` the object was stored with, if any. */
  contentDisposition?: string;
}

/** An object's body as a stream, with the `content-type` and (when known) `content-length` and `content-disposition` headers to send it under. */
export interface ObjectStream {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
}

/**
 * An object's Scan Status, recorded as an S3 object tag while antivirus is on. Every `StorageService` read checks it
 * first and serves only a clean object; an object with none counts as pending (ADR 0016). `pending` is scaffolding for
 * bytes stored without a scan first: no path writes it today, since `upload` scans before storing and tags clean.
 */
export const ScanStatus = {
  PENDING: 'pending',
  SCANNING: 'scanning',
  CLEAN: 'clean',
  INFECTED: 'infected',
  ERROR: 'error',
  /** Over the webhook's scan size cap (`MAX_WEBHOOK_SCAN_SIZE_BYTES`), so never scanned; refused like an unknown status. */
  TOO_LARGE: 'too-large',
} as const;

export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

/**
 * How long a Presigned URL lasts. A URL is checked once, when issued, and stays valid until it expires (ADR 0016),
 * so the default is short. The maximum is the longest lifetime S3 SigV4 signing allows.
 */
export const PresignedUrlLifetime = {
  DEFAULT_SECONDS: 60 * SECONDS_PER_MINUTE,
  MIN_SECONDS: 1,
  MAX_SECONDS: 7 * SECONDS_PER_DAY,
} as const;

/** Object tag keys used to persist scan outcomes on stored objects. */
export const ScanTag = {
  STATUS: 'scan-status',
  TIMESTAMP: 'scan-timestamp',
  VIRUSES: 'scan-viruses',
} as const;

/** `2026-11-21T07:08:09.123Z` becomes `20261121T070809Z`: separators and milliseconds dropped. */
const isoBasicTimestamp = (date: Date): string => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

/**
 * The object tags that record a scan outcome as of now. SeaweedFS stores `PutObject` tag values without URL-decoding
 * them, so every value is kept free of characters that need encoding: the time is ISO 8601 basic format, and ClamAV
 * virus names (letters, digits, `.`, `_`, `-`) are joined with `,`.
 */
export const scanTags = (status: ScanStatus, viruses?: string[]): Record<string, string> => ({
  [ScanTag.STATUS]: status,
  [ScanTag.TIMESTAMP]: isoBasicTimestamp(new Date()),
  ...(viruses?.length ? { [ScanTag.VIRUSES]: viruses.join(',') } : {}),
});

/** How large an image may be going into, and coming out of, a resize. */
export interface ImageLimits {
  maxInputPixels: number;
  maxOutputDimension: number;
}

/**
 * The shape a caller-supplied upload key must have: `/`-separated segments of ASCII letters, digits, `.`, `_` and `-`,
 * none empty or starting with `.` (so no `.`, `..` or hidden segment), at most `MAX_OBJECT_KEY_LENGTH` characters.
 */
export const OBJECT_KEY_PATTERN = /^[\w-][\w.-]*(?:\/[\w-][\w.-]*)*$/;

/** The `Content-Disposition` that makes a browser download an object instead of rendering it. */
export const DOWNLOAD_DISPOSITION = 'attachment';

export type Upload = {
  file: File;
  /** Where to store the file; must match `OBJECT_KEY_PATTERN`. A Public Id is generated when omitted. */
  key?: string;
  /** Replace an object that already has `key`. Without it, an upload to a taken key is refused with a 409. */
  overwrite?: boolean;
  /**
   * Let a browser render a script-capable type (HTML, SVG, XML) inline. Without it, such a file is stored as a
   * download (`Content-Disposition: attachment`), so script in it does not run on the storage origin.
   */
  inlineActiveContent?: boolean;
  /** Largest file accepted. A larger one is refused before it is read. */
  maxSizeBytes: number;
  /** Types accepted, compared with what the file's bytes are. HTML and SVG are refused unless listed. */
  acceptedTypes: readonly string[];
  visibility: BucketVisibility;
  resizeOptions?: ResizeOptions;
  /** Limits for the resize; `ImagesService` applies its defaults when omitted. */
  imageLimits?: ImageLimits;
};
