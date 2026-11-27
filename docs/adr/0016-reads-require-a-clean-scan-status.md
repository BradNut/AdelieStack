---

## status: accepted

# Reads require a clean Scan Status

Uploads and the storage webhook recorded a [Scan Status](../../.knowledge-base/api/glossary.md) on each stored object, and comments said reads could trust it, but no read checked it (issue #195). Second Chance Puzzles, which this template comes from, does check it. There, an upload is stored unscanned and tagged pending, and only the webhook scan makes it clean. Here, the upload scans its bytes before they are stored, so the two templates deliberately differ in when an object becomes clean.

With antivirus on, every read of a stored object needs a clean Scan Status. That covers the in-memory read, the stream, a Presigned URL and a public file URL.

- **Clean only after a passed scan.** An upload stores its object already tagged clean, in the same write, because its bytes passed the scan before storage. Pending is for bytes stored without a scan first; no path does that today. The webhook re-scan confirms or overturns the verdict.
- **No Scan Status is refused.** An object without one is treated as pending, never as clean. The template assumes every object was stored through the upload path, so there is no grandfathering and no backfill.
- **Antivirus off writes no Scan Status and checks none.** Tagging clean while off would let unscanned objects through once antivirus is turned on.
- **A Presigned URL is checked once, when issued.** It stays valid until it expires even if a later scan marks the object error. An infected object is deleted, so its URL stops working anyway.
- **Public objects read straight from storage are not checked.** The public bucket is anonymously readable, so its only protection is the scan at upload.
- **Each refusal carries a `StorageErrorCode`.** A pending object is `425`, an infected one `410`, a scan with no verdict `500` and an unrecognised Scan Status `403`. The `500` cannot be told from a real fault by its status alone, so each refusal also sends a stable code (`SCAN_PENDING`, `SCAN_INFECTED`, `SCAN_FAILED`, `SCAN_REFUSED`) that a future download route or web page can act on without matching message text.

## Considered options

- Tag pending on upload and let the webhook scan decide, as Second Chance Puzzles does: rejected. Every upload would be refused until a webhook that the local stack never configures re-scans it, and the upload has already scanned the bytes.
- Remove the read-time promise and keep the tags as a record only: rejected. The template should be safe once an app adds a download route.
- Treat an object without a Scan Status as clean: rejected. It defeats the check.
