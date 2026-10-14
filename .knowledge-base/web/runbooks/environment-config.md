# Web Environment Configuration

Reference: `apps/web/.env.schema` — the single declared source of truth for every env var the
web app reads: names, types, defaults and which are required. This runbook keeps what the schema
cannot say.

## The varlock / `.env.schema` mechanism

- Vars are declared with [`@env-spec`](https://varlock.dev/env-spec) annotations in
  `apps/web/.env.schema`. There is no `.env.example`.
- `@defaultSensitive=inferFromPrefix('PUBLIC_')`: only `PUBLIC_`-prefixed vars may reach the client
  bundle; everything else stays server-only.
- Real values live in `.env` (local, gitignored) or `.env.local` (personal overrides, gitignored,
  **highest precedence**). Never commit real secrets into `.env.schema`; it declares shape, not
  values.
- At build time `@varlock/vite-integration` (wired in `apps/web/vite.config.ts`) loads and
  validates the schema. At runtime Docker needs `varlock run` (see
  [Deployment](./deployment.md#docker-appswebdockerfile)).

## Gotchas

- `ORIGIN` is not read by the web server since adapter-node 6 (the API keeps its own `ORIGIN` for
  CORS). To pin the origin SvelteKit trusts, set `WEB_ORIGIN`: build-time, passed to
  `paths.origin` in `vite.config.ts`, baked into the build. Set it for plain-HTTP deployments; see
  [Deployment](./deployment.md#request-origin-adapter-node-6).
- `API_PROXY_BASE_URL` is the target for `src/routes/api/[...slug]/+server.ts` and is never
  exposed to the client.
- `PUBLIC_IMAGE_URI` is required with no cross-environment default. It must be supplied as a
  Docker build arg (see Deployment) and kept equal to the API's value.
- Sentry source-map upload is opt-in: `SENTRY_*` vars only matter when
  `ENABLE_SENTRY_BUILD_PLUGIN` is `true`.
- Redis is API-side only (see [Session Issues](./session-issues.md)); the web app reads only what
  `.env.schema` declares.

## Captcha

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
