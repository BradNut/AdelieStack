# E2E / Smoke Test Debugging

## Test Files

```
apps/web/e2e/
  demo.test.ts                — demo smoke test
```

This is the entire real suite today. There is no `apps/web/dev-smoke.mjs` smoke script and no
`apps/web/e2e/README.md` — neither exists in this repo; if you find references to them elsewhere,
they're stale.

## Known repo bug: `*:dev` scripts reference a config file that doesn't exist

`apps/web/package.json` defines:

```json
"test:e2e:dev": "playwright test --config=playwright.config.dev.ts",
"test:ui:dev": "svelte-kit sync && playwright test --ui --config=playwright.config.dev.ts",
```

but only `apps/web/playwright.config.ts` exists on disk — there is no `playwright.config.dev.ts`.
**Running `test:e2e:dev` or `test:ui:dev` today fails** with a Playwright "config file not found"
error. This is a real repo bug, not a doc error — either add the missing dev config or remove/fix
these scripts. Until then, use the plain `test:e2e` / `test:ui` scripts below (they use the config
that actually exists).

## Run E2E Locally (against dev server or built app)

```bash
# Install browsers once
pnpm --filter @adelie/web test:e2e:deps

# Option A: against the dev server (start it first, separate terminal)
pnpm --filter @adelie/web dev
pnpm --filter @adelie/web test:e2e

# Option B: against a production build
pnpm --filter @adelie/web build
pnpm --filter @adelie/web test:e2e
```

Check `apps/web/playwright.config.ts` for which `baseURL` / webServer command it drives by default
before assuming either mode "just works".

## Playwright UI Mode (interactive)

```bash
pnpm --filter @adelie/web test:ui
```

Opens browser with trace viewer — use to inspect failing test step-by-step. (`test:ui:dev` is
currently broken — see the known bug above.)

## Common Failures

| Symptom | Likely cause |
|---|---|
| `net::ERR_CONNECTION_REFUSED` | Dev server not running or wrong `baseURL` in config |
| Login test fails | Test user not seeded or password changed |
| Flaky on CI | Add `--retries=2` or increase timeouts in `playwright.config.ts` |
| Screenshots differ | Playwright version or OS font rendering diff — use `--update-snapshots` |

## Config Files

- `apps/web/playwright.config.ts` — the only Playwright config that exists in this repo.
- `apps/web/playwright.config.dev.ts` — referenced by `test:e2e:dev`/`test:ui:dev` in
  `package.json` but **does not exist on disk**. See the known bug above.

## Related

- [Deployment](./deployment.md)
- [Session Issues](./session-issues.md)
