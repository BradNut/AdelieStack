# Storage Service

## Purpose

Provides S3-compatible object storage for file uploads (for example user avatars). SeaweedFS serves the S3 API
in local development; any S3-compatible provider works in production.

## Responsibilities

- Ensure the public and private buckets exist on startup (idempotent); any storage error fails the boot
- Upload files, optionally resizing images through `ImagesService`
- Read and delete objects

## Key Concepts

### Buckets

Bucket names are derived, never hard-coded: `${PROJECT_NAME}-${visibility}-${ENVIRONMENT}` via
`buildBucketName` in `storage/storage.buckets.ts`. `BucketVisibility` is `public` or `private`.

- `adelie-public-development` - anonymously readable; served through `PUBLIC_IMAGE_URI`
- `adelie-private-development` - credentials required

Anonymous read access is not set with a bucket policy. SeaweedFS grants it through the `anonymous` identity in
`docker/seaweedfs/s3-config.json` (`Read:<public-bucket>`). If you change `PROJECT_NAME` or `ENVIRONMENT`, update
that identity and restart SeaweedFS.

### Local setup

1. `docker compose up -d seaweedfs` (S3 API on `:8333`, filer UI on `:8888`, master on `:9333`)
2. `pnpm storage:setup` runs `scripts/setup-seaweedfs.sh`, which creates both buckets through the S3 API. It is
   safe to re-run. `pnpm initialize` runs it for you. The API also creates missing buckets when it starts.

## Code Map

- `storage/s3-storage.client.ts` - thin `@aws-sdk/client-s3` wrapper (path-style addressing, SigV4)
- `storage/storage.service.ts` - `configure`, `upload`, `get`, `remove`; the S3 client is created lazily on first use
- `storage/images.service.ts` - `ImagesService`, the one home for image processing (`resize`, using `sharp`); forks can inject it directly. Bytes or options it cannot use are refused with a 422; failures of the server itself stay 500s, with the `sharp` error logged rather than returned
- `storage/content-type.ts` - identifies an upload from its leading bytes
- `storage/storage.buckets.ts` - `BucketVisibility` and `buildBucketName`
- `storage/storage.types.ts` - client config and upload types
- `storage/tests/` - client, service, and `s3-config.json` tests

## Configuration

`STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_SSL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `PROJECT_NAME`,
`ENVIRONMENT`. See the [API environment config runbook](../../runbooks/environment-config.md).

## Security Considerations

- Keep private files in the private bucket; the anonymous identity must never reference it
- Storage credentials stay server-side
- Every `upload` declares `maxSizeBytes`, `acceptedTypes` and `visibility`; there is no default bucket. Limits from `@adelie/shared` (`MAX_UPLOAD_SIZE_BYTES`, `ACCEPTED_IMAGE_TYPES`) are the usual values
- The stored content type comes from the file's bytes. Empty files and unrecognisable bytes get a 422, larger files a 413 and unlisted types a 415, all before the whole file is read. HTML and SVG are refused unless listed in `acceptedTypes`
- Resizes refuse inputs over `maxInputPixels` and outputs over `maxOutputDimension` with a 422; pass `imageLimits` to change the defaults in `@adelie/shared`
- A route that accepts uploads should also set a body limit, since multipart parsing happens before `upload` runs

## Related Documentation

- [API Index](../../index.md)
- [Infrastructure runbook](../../runbooks/infrastructure.md)
