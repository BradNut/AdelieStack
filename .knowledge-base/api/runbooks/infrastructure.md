# Infrastructure Troubleshooting

Covers Redis, SeaweedFS / S3 (storage), ClamAV (antivirus), and email (Unsend).

## Redis

### Symptoms

- Rate limiting not working
- Session reads returning empty
- BullMQ jobs not processing
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
| Import-time connection | Move `ioredis` client init to lazy getter — never connect at import |

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

Check both buckets exist and `PROJECT_NAME` / `ENVIRONMENT` match the bucket names.

### Fixes

| Problem | Fix |
|---|---|
| Wrong `STORAGE_*` vars | Verify `STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Bucket not found | Run `pnpm storage:setup` (creates `<PROJECT_NAME>-public-<ENVIRONMENT>` and `<PROJECT_NAME>-private-<ENVIRONMENT>`) |
| Public files return 403 | Grant `Read:<public-bucket>` to the `anonymous` identity in `docker/seaweedfs/s3-config.json`, then restart SeaweedFS |
| `STORAGE_SSL=false` in prod | If storage is behind HTTPS, set `STORAGE_SSL=true` |

---

## ClamAV (Antivirus)

### Symptoms

- File uploads rejected with scan error
- `ECONNREFUSED` on `CLAMAV_HOST:CLAMAV_PORT`

### Diagnosis

```bash
echo 'PING' | nc $CLAMAV_HOST $CLAMAV_PORT
# Expect: PONG
```

### Fixes

| Problem | Fix |
|---|---|
| ClamAV not running | Start ClamAV container; check Coolify service status |
| Wrong host/port | Verify `CLAMAV_HOST` and `CLAMAV_PORT` |
| Disable for dev/test | Set `ANTIVIRUS_ENABLED=false` (dev only) |

---

## Email (Unsend)

### Symptoms

- Signup/password reset emails not sending
- `401` or `403` from email API calls in logs

### Diagnosis

Check `API_KEY` and `API_BASE_URL` set correctly. Test with:

```bash
curl -X POST https://$API_BASE_URL/emails \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","to":["you@example.com"],"subject":"test","text":"test"}'
```

### Fixes

| Problem | Fix |
|---|---|
| Wrong `API_KEY` | Update in Coolify env → redeploy |
| `API_BASE_URL` missing trailing slash | Check format matches `apps/api/.env.example` |
| Dev: use Mailpit instead | Point `API_BASE_URL` to local Mailpit SMTP-compatible endpoint |

## Related

- [Environment Configuration](./environment-config.md)
- [Deployment](./deployment.md)
