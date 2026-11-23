export const MAX_UPLOAD_SIZE_MB = 3 as const;
export const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * MAX_UPLOAD_SIZE_MB;

export const MAX_IMAGE_INPUT_PIXELS = 50_000_000;
export const MAX_IMAGE_OUTPUT_DIMENSION = 4096;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

/** Longest caller-supplied object key an upload accepts, in characters. S3 allows 1024 bytes; this leaves room for any prefix. */
export const MAX_OBJECT_KEY_LENGTH = 512;

/** Largest object the storage webhook scans. A larger one is not read; it is tagged `too-large` instead. Within ClamAV's default stream limit. */
export const MAX_WEBHOOK_SCAN_SIZE_MB = 25 as const;
export const MAX_WEBHOOK_SCAN_SIZE_BYTES = 1024 * 1024 * MAX_WEBHOOK_SCAN_SIZE_MB;

/** Webhook scans that run at once, across every request. Others wait their turn. */
export const MAX_CONCURRENT_WEBHOOK_SCANS = 4;

/** Webhook scans accepted but not finished (running plus waiting). A notification that would exceed it is refused with a 503. */
export const MAX_PENDING_WEBHOOK_SCANS = 100;
