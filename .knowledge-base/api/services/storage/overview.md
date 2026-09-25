# Storage Service

## Purpose

Provides S3-compatible object storage for file uploads (for example user avatars). SeaweedFS serves the S3 API
in local development; any S3-compatible provider works in production.

## Responsibilities

- Ensure the public and private buckets exist on startup (idempotent)
- Upload files, optionally resizing images with `sharp`
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
   safe to re-run. `pnpm initialize` runs it for you.

## Code Map

- `storage/s3-storage.client.ts` - thin `@aws-sdk/client-s3` wrapper (path-style addressing, SigV4)
- `storage/storage.service.ts` - `configure`, `upload`, `get`, `remove`; the S3 client is created lazily on first use
- `storage/storage.buckets.ts` - `BucketVisibility` and `buildBucketName`
- `storage/storage.types.ts` - client config and upload types
- `storage/tests/` - client, service, and `s3-config.json` tests

## Configuration

`STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_SSL`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `PROJECT_NAME`,
`ENVIRONMENT`. See the [API environment config runbook](../../runbooks/environment-config.md).

## Security Considerations

- Keep private files in the private bucket; the anonymous identity must never reference it
- Storage credentials stay server-side
- Validate file type and size before upload (`@adelie/shared` file limits)

## Related Documentation

- [API Index](../../index.md)
- [Infrastructure runbook](../../runbooks/infrastructure.md)
