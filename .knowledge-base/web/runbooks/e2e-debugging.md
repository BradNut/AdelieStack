# E2E / Smoke Test Debugging

## Test Files

```
apps/web/e2e/
  mainpage.test.ts           — home page smoke
  aboutpage.test.ts          — about page smoke
  puzzle-request.test.ts     — puzzle request flow
  dev-smoke-auth-donation.test.ts — auth + donation flow
apps/web/dev-smoke.mjs       — full smoke script (runs against live URL)
apps/web/e2e/README.md       — setup + usage guide
```

## Run E2E Locally (against dev server)

```bash
# Install browsers once
pnpm --filter @secondchance/web test:e2e:deps

# Start dev server first (separate terminal)
pnpm --filter @secondchance/web dev

# Run tests
pnpm --filter @secondchance/web test:e2e:dev
```

## Run E2E Locally (against built app)

```bash
pnpm --filter @secondchance/web build
pnpm --filter @secondchance/web test:e2e
```

## Run Smoke Script Against Live URL

```bash
BASE_URL=https://<domain> node apps/web/dev-smoke.mjs
```

Script requires env vars for test user credentials. See `dev-smoke.mjs` header comments.

## Playwright UI Mode (interactive)

```bash
pnpm --filter @secondchance/web test:ui:dev
```

Opens browser with trace viewer — use to inspect failing test step-by-step.

## Common Failures

| Symptom | Likely cause |
|---|---|
| `net::ERR_CONNECTION_REFUSED` | Dev server not running or wrong `baseURL` in config |
| Login test fails | Test user not seeded or password changed |
| Turnstile challenge blocks test | Dev mode uses bypass key `1x00000000000000000000AA` — confirm env set |
| Flaky on CI | Add `--retries=2` or increase timeouts in `playwright.config.ts` |
| Screenshots differ | Playwright version or OS font rendering diff — use `--update-snapshots` |

## Config Files

- `apps/web/playwright.config.ts` — production/CI config
- `apps/web/playwright.config.dev.ts` — dev server config (`baseURL: http://localhost:5173`)

## Related

- [Deployment](./deployment.md)
- [Session Issues](./session-issues.md)
