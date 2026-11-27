/**
 * Why a read of a stored object was refused while antivirus is on: its Scan Status is not clean (ADR 0016).
 * Our own codes, sent as `code` next to the message so a client can act on them without matching text.
 */
export const StorageErrorCode = {
  /** No Scan Status yet, or pending or scanning: try again later (425). */
  SCAN_PENDING: 'SCAN_PENDING',
  /** The scan found a virus; the object is gone (410). */
  SCAN_INFECTED: 'SCAN_INFECTED',
  /** The scan could not reach a verdict (500). */
  SCAN_FAILED: 'SCAN_FAILED',
  /** A Scan Status the API does not recognise, refused rather than trusted (403). */
  SCAN_REFUSED: 'SCAN_REFUSED',
} as const;
export type StorageErrorCode = (typeof StorageErrorCode)[keyof typeof StorageErrorCode];
