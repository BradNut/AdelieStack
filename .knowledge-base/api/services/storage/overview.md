# Storage Service

## Purpose

Provides S3-compatible object storage for file uploads (for example user avatars). SeaweedFS serves the S3 API
in local development; any S3-compatible provider works in production.

## Responsibilities

- Ensure the public and private buckets exist on startup (idempotent); any storage error fails the boot
- Upload files, optionally resizing images through `ImagesService`
- Read objects (in memory, as a stream, as a Presigned URL or a file URL), honouring their Scan Status, and delete them

## Key Concepts

### Buckets

Bucket names are derived, never hard-coded: `${PROJECT_NAME}-${visibility}-${ENVIRONMENT}` via
`buildBucketName` in `storage/storage.buckets.ts`. `BucketVisibility` is `public` or `private`.

- `adelie-public-development` - anonymously readable; served through `PUBLIC_IMAGE_URI`
- `adelie-private-development` - credentials required

Anonymous read access is not set with a bucket policy. SeaweedFS grants it through the `anonymous` identity in
`docker/seaweedfs/s3-config.json` (`Read:<public-bucket>`). If you change `PROJECT_NAME` or `ENVIRONMENT`, update
that identity and restart SeaweedFS.

### Scan Status and the read check

With `ANTIVIRUS_ENABLED` on, each object carries a [Scan Status](../../glossary.md) as object tags
(`scan-status`, `scan-timestamp`, `scan-viruses`; ADR 0016):

- `upload` scans the bytes before storing them, so it stores the object already tagged `clean`, in
  the same `PutObject` call. The webhook re-scan (`file-scanner.worker.ts`) writes `scanning`, then
  `clean`, `error`, or `infected` (and deletes the object). Nothing writes `pending` today
- `scan-timestamp` is ISO 8601 basic format (`20261121T070809Z`): SeaweedFS stores `PutObject` tag
  values without URL-decoding them, so tag values must need no encoding
- Every read (`get`, `getObjectStream`, `getSignedUrl`, `getFileUrl`) checks the Scan Status before
  fetching any bytes, for both buckets:

  | Scan Status | Response | `code` (`StorageErrorCode`) |
  |---|---|---|
  | none, `pending`, `scanning` | 425 | `SCAN_PENDING` |
  | `infected` | 410 | `SCAN_INFECTED` |
  | `error` | 500 | `SCAN_FAILED` |
  | any other value | 403 | `SCAN_REFUSED` |
  | `clean` | the object | none |

- A failure to read the tags (an outage, a missing key) propagates unchanged; it is not reported as pending
- `getScanStatus` returns the recorded value, or `null` when there is none
- With antivirus off, no Scan Status is written and no read checks one

The check has two limits. A Presigned URL is checked only when issued: it works until it expires,
even if a later scan marks the object `error` (an infected object is deleted, so its URL stops
working). A public object read straight from storage through `PUBLIC_IMAGE_URI` is not checked at
all, because the bucket is anonymously readable: its only protection is the scan at upload.

### Addresses and URLs

- `STORAGE_HOST`/`STORAGE_PORT`/`STORAGE_SSL`: where the API itself reaches storage (internal)
- `STORAGE_URL`: the address browsers reach storage on. Presigned URLs are signed against it by a
  second S3 client (`S3Presigner`), created on first use, because a signature covers the host
- `PUBLIC_IMAGE_URI`: the public bucket's browser-facing base. `getFileUrl` returns it plus the
  (encoded) key for a public object, and a Presigned URL for a private one
- Presigned URL lifetime: `PresignedUrlLifetime` in `storage.types.ts`, one hour by default; a
  requested lifetime that is not a whole number of seconds from 1 second to 7 days is refused with a 400
- Who may read a private object is not decided here; see #315

### Local setup

1. `docker compose up -d seaweedfs` (S3 API on `:8333`, filer UI on `:8888`, master on `:9333`)
2. `pnpm storage:setup` runs `scripts/setup-seaweedfs.sh`, which creates both buckets through the S3 API. It is
   safe to re-run. `pnpm initialize` runs it for you. The API also creates missing buckets when it starts.

## Code Map

- `storage/s3-storage.client.ts` - thin `@aws-sdk/client-s3` wrapper (path-style addressing, SigV4), `S3Presigner` (`@aws-sdk/s3-request-presigner`), and the provider that creates each on first use
- `storage/storage.service.ts` - `configure`, `upload`, `get`, `getObjectStream`, `getSignedUrl`, `getFileUrl`, `getScanStatus`, `remove`
- `storage/file-scanner.worker.ts` - webhook re-scan that records the Scan Status
- `storage/images.service.ts` - `ImagesService`, the one home for image processing (`resize`, using `sharp`); forks can inject it directly. Bytes or options it cannot use are refused with a 422; failures of the server itself stay 500s, with the `sharp` error logged rather than returned
- `storage/content-type.ts` - identifies an upload from its leading bytes
- `storage/storage.buckets.ts` - `BucketVisibility` and `buildBucketName`
- `storage/storage.types.ts` - client config, upload types, `ScanStatus`, `scanTags`, `PresignedUrlLifetime`
- `storage/tests/` - client, service, and `s3-config.json` tests

## Configuration

`STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_SSL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_URL`, `PUBLIC_IMAGE_URI`, `ANTIVIRUS_ENABLED`, `PROJECT_NAME`,
`ENVIRONMENT` (required, no default; `scripts/setup-seaweedfs.sh` defaults its own to `development`, so give it the
API's value). See the [API environment config runbook](../../runbooks/environment-config.md).

## Security Considerations

- Keep private files in the private bucket; the anonymous identity must never reference it
- Storage credentials stay server-side
- With antivirus on, only a clean object is read; a Presigned URL is checked only when issued, and a public object read straight from storage is protected only by the scan at upload (see the read check above)
- Every `upload` declares `maxSizeBytes`, `acceptedTypes` and `visibility`; there is no default bucket. Limits from `@adelie/shared` (`MAX_UPLOAD_SIZE_BYTES`, `ACCEPTED_IMAGE_TYPES`) are the usual values
- The stored content type comes from the file's bytes. Empty files and unrecognisable bytes get a 422, larger files a 413 and unlisted types a 415, all before the whole file is read. HTML and SVG are refused unless listed in `acceptedTypes`
- Resizes refuse inputs over `maxInputPixels` and outputs over `maxOutputDimension` with a 422; pass `imageLimits` to change the defaults in `@adelie/shared`
- A route that accepts uploads should also set a body limit, since multipart parsing happens before `upload` runs

## Related Documentation

- [API Index](../../index.md)
- [Infrastructure runbook](../../runbooks/infrastructure.md)
