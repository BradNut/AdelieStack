# Infrastructure Troubleshooting

Covers Redis, SeaweedFS / S3 (storage), ClamAV (antivirus, unwired), and email (unwired).

## Redis

### Symptoms

- Rate limiting not working
- Session reads returning empty
- `EHOSTUNREACH` or `ECONNREFUSED` in logs

### Diagnosis

```bash
redis-cli -u $REDIS_URL ping
# Expect: PONG
```

### Fixes

| Problem | Fix |
|---|---|
| Wrong `REDIS_URL` | Update in Coolify env → redeploy |
| Redis container down | Restart Redis service in Coolify |
| Container network mismatch | Put API and Redis on same Coolify network |
| Import-time connection | Move `ioredis` client init to lazy getter — never connect at import (see `apps/api/src/lib/server/api/databases/redis/redis.service.ts`, which already lazily instantiates the client on first `.redis` access) |

---

## SeaweedFS / S3 (Storage)

### Symptoms

- File uploads failing
- Images not serving

### Diagnosis

```bash
curl -s -o /dev/null -w '%{http_code}\n' --aws-sigv4 aws:amz:us-east-1:s3 \
  -u "$STORAGE_ACCESS_KEY:$STORAGE_SECRET_KEY" "$STORAGE_URL/"
# Expect: 200 (403 means the credentials do not match an identity in s3-config.json)
```

Check both buckets exist and `PROJECT_NAME` / `ENVIRONMENT` match the bucket names (built by
`buildBucketName` in `apps/api/src/lib/server/api/storage/storage.buckets.ts` as
`<PROJECT_NAME>-<public|private>-<ENVIRONMENT>`).

### Fixes

| Problem | Fix |
|---|---|
| Wrong `STORAGE_*` vars | Verify `STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Bucket not found | Run `pnpm storage:setup` (creates `<PROJECT_NAME>-public-<ENVIRONMENT>` and `<PROJECT_NAME>-private-<ENVIRONMENT>`) |
| Public files return 403 | Grant `Read:<public-bucket>` to the `anonymous` identity in `docker/seaweedfs/s3-config.json`, then restart SeaweedFS |
| `STORAGE_SSL=false` in prod | If storage is behind HTTPS, set `STORAGE_SSL=true` |

---

## ClamAV (Antivirus) — dependency present, not wired up

`clamscan` is listed as a dependency in `apps/api/package.json`, but there is no code anywhere in
`apps/api/src` that imports or calls it. There is no antivirus scanning happening on uploads
today, and no `ANTIVIRUS_ENABLED`/`CLAMAV_HOST`/`CLAMAV_PORT` env vars exist in
`apps/api/.env.schema`. Treat this section as "if you're building ClamAV scanning," not as a
troubleshooting guide for a live feature.

If you wire it up, add the corresponding vars to `apps/api/.env.schema` first (per repo
convention, every var the API reads must be declared there) before writing the integration.

---

## Email — useSend in production, Mailpit locally

`MAILER_TRANSPORT` picks the transport. `mailpit` (the default) posts to the Mailpit inbox in the
local stack. `unsend` sends through useSend (formerly Unsend) with `usesend-js`, in
`apps/api/src/lib/server/api/mail/usesend-mailer.service.ts`. Its variables are in
[Environment Configuration](./environment-config.md#email).

- **One email per recipient**, with a plain-text part alongside the HTML. Both transports send it.
- **Failures**: `emails.send()` resolves with an `error` when the API refuses a send and throws when
  the request itself fails; both count as failures. Every failure is retried, up to 3 attempts, after
  250 ms and then 500 ms, and the last failure is re-thrown to the caller.
- **No duplicates on retry**: every attempt for one message and recipient carries the same
  `Idempotency-Key`.
- **Logs**: one entry per attempt, `useSend email sent` (info) or `useSend email failed` (warn), with
  `to`, `attempt` and, on failure, `error` (`code: message`). Never the email body or the API key.

## Related

- [Environment Configuration](./environment-config.md)
- [Deployment](./deployment.md)
