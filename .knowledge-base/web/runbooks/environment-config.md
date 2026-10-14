# Web Environment Configuration

Reference: `apps/web/.env.schema` — the single declared source of truth for every env var the
web app reads.

## The varlock / `.env.schema` mechanism

Env vars are declared with [`@env-spec`](https://varlock.dev/env-spec) annotations directly above
each variable in `apps/web/.env.schema`, not in a `.env.example` file (no such file exists in this
repo). Key annotations used here:

- `@type=...` — value type/shape, e.g. `url`, `string`, `number(min=1)`, `boolean`,
  `enum(development, staging, production)`.
- `@sensitive=false` / inferred — whether the var may be exposed to the client. The schema's
  top-level directive `@defaultSensitive=inferFromPrefix('PUBLIC_')` means only `PUBLIC_`-prefixed
  vars are treated as safe to reach the client bundle by default; everything else stays
  server-only.
- `@required` / `@required=false` — the schema's top-level `@defaultRequired=infer` means a
  variable is inferred required unless it has a default value or is explicitly marked
  `@required=false`.
- `@generateTsTypes(path=env.d.ts)` — the schema generates TypeScript types for the env at that
  path.

Real values live in `.env` (local, gitignored) or `.env.local` (personal overrides, gitignored,
**highest precedence** — takes priority over `.env`). Never commit real secrets into
`.env.schema` itself; it only declares shape, not values.

At runtime, the app validates/resolves env through varlock (see
[Deployment](./deployment.md#docker-appswebdockerfile) for the `varlock run` requirement in
Docker). At build time, `@varlock/vite-integration`'s Vite plugin (wired in
`apps/web/vite.config.ts`) loads and validates the schema.

## Variables (from `apps/web/.env.schema`)

| Variable | Type | Required | Default | Notes |
|---|---|---|---|---|
| `ENVIRONMENT` | `enum(development, staging, production)` | has default | `development` | Deployment environment. |
| `ORIGIN` | `url` | no (`@required=false`) | `http://localhost:5173` | Not read by the web server since adapter-node 6 (the API still uses its own `ORIGIN` for CORS). To pin the origin SvelteKit trusts, use `WEB_ORIGIN` below. |
| `WEB_ORIGIN` | `url` | build-time, optional | unset | Passed to `paths.origin` in `vite.config.ts`. Baked into the build. Set it for plain-HTTP deployments; see [Deployment](./deployment.md#request-origin-adapter-node-6). |
| `DOMAIN` | `string` | no (`@required=false`) | `localhost` | Hostname only — no protocol, no path. Used for session cookie domain. |
| `PORT` | `number(min=1)` | no (`@required=false`) | `5173` | Node server port (adapter-node runtime). |
| `HOST` | `string` | no (`@required=false`) | `0.0.0.0` | Bind address. |
| `API_PROXY_BASE_URL` | `url` | no (`@required=false`) | `http://127.0.0.1:3001` | Target for `src/routes/api/[...slug]/+server.ts`. Never exposed to the client. |
| `SHOW_OAUTH_BUTTONS` | `boolean` | has default | `false` | `true` to show OAuth login. |
| `PUBLIC_IMAGE_URI` | `url` | **yes** | none | Public storage base URI (SeaweedFS S3 locally, any S3-compatible provider in production). Only the public base URL is read by the web app, so it's safe to expose to the client — but it has no sensible cross-environment default, so it's required. Must be supplied as a Docker build arg (see Deployment). |
| `ENABLE_SENTRY_BUILD_PLUGIN` | `boolean` | no | `false` | Enables the Sentry source-map-upload build plugin. |
| `SENTRY_ORG` | `string` | no | empty | Only meaningful when the Sentry build plugin is enabled. |
| `SENTRY_PROJECT` | `string` | no | empty | Only meaningful when the Sentry build plugin is enabled. |
| `SENTRY_URL` | `url` | no | empty | Only meaningful when the Sentry build plugin is enabled. |
| `SENTRY_AUTH_TOKEN` | — | no | empty | Sensitive (no `@sensitive=false` annotation, so it's inferred sensitive since it isn't `PUBLIC_`-prefixed). |

There is no `REDIS_URL`, `API_KEY`,
`API_BASE_URL`, `SITE_NAME`, `SITE_URL`, `SUPPORT_EMAIL`, `PUBLIC_UMAMI_URL`/`PUBLIC_UMAMI_ID`,
`OTEL_*`, or `SITE_VERSION`/`PUBLIC_SITE_VERSION` in `apps/web/.env.schema` — none of these are
real web-app config. (Redis is API-side only; see [Session Issues](./session-issues.md).)

### Captcha

The web has no captcha variables. Captcha is configured only in the API env (`CAPTCHA_*`, see the
[API environment runbook](../../api/runbooks/environment-config.md#captcha)). The web reads whether it
is on, the provider and the public site key at runtime from `GET /api/config/captcha`, renders the
matching widget (Cloudflare Turnstile or hCaptcha ship; other providers need a `CaptchaWidget`
implementation) and sends the token in the `x-captcha-response` header.

## Local Dev

There is no `.env.example` to copy, and no `.env` is needed: every web variable, including
`PUBLIC_IMAGE_URI` (the local SeaweedFS public bucket), has a default in `apps/web/.env.schema`.
Just run:

```bash
pnpm --filter @adelie/web dev
```

Create `apps/web/.env.local` only to override a default (e.g. pointing `API_PROXY_BASE_URL` at a
non-default API host/port, enabling `SHOW_OAUTH_BUTTONS`, or changing `PUBLIC_IMAGE_URI` outside
local dev; keep it equal to the API's value).

## Related

- [Deployment](./deployment.md)
- [API Connection Issues](./api-connection.md)
