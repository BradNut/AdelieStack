/** Largest object the storage webhook scans. A larger one is not read; it is tagged `too-large` instead. Within ClamAV's default stream limit. */
export const MAX_WEBHOOK_SCAN_SIZE_MB = 25 as const;
export const MAX_WEBHOOK_SCAN_SIZE_BYTES = 1024 * 1024 * MAX_WEBHOOK_SCAN_SIZE_MB;

/** Webhook scans that run at once, across every request. Others wait their turn. */
export const MAX_CONCURRENT_WEBHOOK_SCANS = 4;

/** Webhook scans accepted but not finished (running plus waiting). A notification that would exceed it is refused with a 503. */
export const MAX_PENDING_WEBHOOK_SCANS = 100;
