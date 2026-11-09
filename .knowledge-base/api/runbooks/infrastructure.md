# Infrastructure Troubleshooting

Covers Redis, SeaweedFS / S3 (storage), ClamAV (antivirus), and email (unwired).

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
| API exits at startup with a storage error | Storage is unreachable or the credentials cannot create or read the buckets. The API does not serve until storage answers |
| Bucket not found | Restart the API, or run `pnpm storage:setup` (either creates `<PROJECT_NAME>-public-<ENVIRONMENT>` and `<PROJECT_NAME>-private-<ENVIRONMENT>`) |
| Public files return 403 | Grant `Read:<public-bucket>` to the `anonymous` identity in `docker/seaweedfs/s3-config.json`, then restart SeaweedFS |
| `STORAGE_SSL=false` in prod | If storage is behind HTTPS, set `STORAGE_SSL=true` |

---

## ClamAV (Antivirus)

Uploads are scanned on their final bytes, after any resize and before they reach storage, when
`ANTIVIRUS_ENABLED` is on (it defaults to `false`). The API talks to a clamd daemon at
`CLAMAV_HOST`:`CLAMAV_PORT`, and the connection opens on the first scan. Locally, clamd is the
`clamav` service in `docker-compose.yaml`.

The upload path fails closed: while scanning is on, an upload the scanner cannot check is refused,
so a clamd outage stops uploads.

### Symptoms

- Uploads failing with 503 `File could not be scanned for viruses`
- Uploads failing with 422 `File rejected: virus detected`
- Stored objects with no `scan-status` tag
- `Failed to initialize ClamAV scanner` or `Error scanning stream` in logs

### Diagnosis

```bash
printf 'nPING\n' | nc -w 2 "$CLAMAV_HOST" "$CLAMAV_PORT"
# Expect: PONG
```

### Fixes

| Problem | Fix |
|---|---|
| 503 on every upload | clamd is down or unreachable. Check `CLAMAV_HOST` / `CLAMAV_PORT` and the clamd container. A freshly started clamd takes a while to load its signatures before it answers |
| 422 on an upload | Working as intended: clamd flagged the file, and the signature name is in the response and the logs. Nothing was stored |
| Objects have no `scan-status` tag | `ANTIVIRUS_ENABLED` is off, so uploads are not being scanned. Set it to `true` and redeploy |
| Object tagged `scan-status=error` | The storage webhook re-scan could not reach a verdict. Unlike the upload path, it leaves the object in place, so check clamd and review the object |

---

## Email — useSend in production, Mailpit locally

`MAILER_TRANSPORT` picks the transport. `mailpit` (the default) posts to the Mailpit inbox in the
local stack. `unsend` sends through useSend (formerly Unsend) with `usesend-js`, in
`apps/api/src/lib/server/api/mail/usesend-mailer.service.ts`. Its variables are in
[Environment Configuration](./environment-config.md#email).

- **One email per recipient**, with a plain-text part alongside the HTML. Both transports send it.
- **Failures**: `emails.send()` resolves with an `error` when the API refuses a send and throws when
  the request itself fails; both count as failures. Every failure is retried, up to 3 attempts, after
  250 ms and then 500 ms. A recipient that exhausts its attempts does not stop the others; once all
  have been tried, the first failure is re-thrown to the caller. What the caller does with it is in the
  [IAM runbook](../services/iam/runbook.md).
- **No duplicates on retry**: every attempt for one message and recipient carries the same
  `Idempotency-Key`.
- **Logs**: one entry per attempt, `useSend email sent` (info) or `useSend email failed` (warn), with
  `userId`, `template`, `attempt` and, on failure, `error` (`code: message`). `userId` is `null` for a
  recipient with no account. Never the recipient's address, the email body or the API key: anything shaped
  like an address in `error` reads `[email]`, and so does the error handed to the caller for a refused send.
  To trace a recipient, see the [IAM runbook](../services/iam/runbook.md).

## Related

- [Environment Configuration](./environment-config.md)
- [Deployment](./deployment.md)
