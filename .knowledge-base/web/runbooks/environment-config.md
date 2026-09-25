# Web Environment Configuration

Reference: `apps/web/.env.example`

## Critical (app won't work without these)

| Variable | Example | Notes |
|---|---|---|
| `ORIGIN` | `https://secondchancepuzzles.com` | SvelteKit CSRF + cookie validation. Must match exact public URL. |
| `DOMAIN` | `secondchancepuzzles.com` | Hostname only. Used for session cookie domain. |
| `PORT` | `3000` | Node server port. |
| `API_PROXY_BASE_URL` | `http://api:3001` | Internal API URL. Never exposed to client. |
| `REDIS_URL` | `redis://redis:6379` | Rate limiting + session data. |
| `PUBLIC_IMAGE_URI` | `https://storage.example.com/adelie-public-production` | Public storage bucket base URI. |
| `PROJECT_NAME` | `adelie` | Storage bucket namespace. |
| `TURNSTILE_SECRET_KEY` | `<key>` | Cloudflare Turnstile server secret. |
| `PUBLIC_TURNSTILE_SITE_KEY` | `<key>` | Cloudflare Turnstile public key. |
| `API_KEY` | `<key>` | Unsend email API key. |
| `API_BASE_URL` | `app.usesend.com/api/` | Unsend email base URL. |
| `SITE_NAME` | `Second Chance Puzzles` | Used in email templates. |
| `SITE_URL` | `https://secondchancepuzzles.com` | Used in email link generation. |
| `SUPPORT_EMAIL` | `support@example.com` | Reply-to for outbound emails. |

## Optional

| Variable | Notes |
|---|---|
| `SHOW_OAUTH_BUTTONS` | `true` to show OAuth login. Default `false`. |
| `OTEL_ENABLED` | `true` to enable OpenTelemetry. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP trace endpoint. |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_URL` | Sentry error tracking + source maps. |
| `PUBLIC_UMAMI_URL` / `PUBLIC_UMAMI_ID` | Analytics. |
| `SITE_VERSION` / `PUBLIC_SITE_VERSION` | Build version string. |
| `ENVIRONMENT` | `development` or `production`. |

## Local Dev

```bash
cp apps/web/.env.example apps/web/.env
# Edit: ORIGIN, API_PROXY_BASE_URL, REDIS_URL, PUBLIC_IMAGE_URI
pnpm dev
```

## Related

- [Deployment](./deployment.md)
- [API Connection Issues](./api-connection.md)
